using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Billing;
using MarcaAi.Application.Features.Payments;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>
/// Orquestra a iniciação de pagamento de uma consulta e roteia para o provedor conforme o método:
/// hoje cartão → Stripe Connect (a rota PIX/MP entra quando o split do MP for ligado). Calcula a taxa
/// (FeeCalculator + overrides da sub-conta) e grava o snapshot financeiro no Booking. Ver spec §6.2.
/// </summary>
public sealed class BookingPaymentService(
    ApplicationDbContext db,
    IPayoutAccountService payouts,
    IEnumerable<ISplitPaymentService> splitProviders,
    IConfiguration config,
    ILogger<BookingPaymentService> logger) : IBookingPaymentService
{
    // Taxa **só percentual** por plano (Q1/Q6): a fee vem do plano do recebedor, não de um default
    // fixo. Componente fixo por consulta descontinuado (0) — decisão de produto 2026-08-04.
    private int DefaultFeeFixedCents => ParseIntOr(config["Platform:FeeFixedCents"], 0);

    private static int ParseIntOr(string? value, int fallback) =>
        int.TryParse(value, out var parsed) ? parsed : fallback;

    /// <summary>
    /// Resolve o percentual da taxa de split (basis points) por ordem de precedência (§4.3 + Q6):
    /// 1º <c>PayoutAccount.FeePercentBps</c> (override da sub-conta);
    /// 2º recebedor TEAM → <c>Subscription.DefaultFeeBps</c>, senão o feeBps do <c>PlanCode</c> via
    ///    <see cref="PlanCatalog"/>, senão a taxa base de clínica;
    /// 3º recebedor USER (individual) → plano free <b>Solo (10%)</b>. A taxa de 5% do Solo Pro
    ///    depende do billing por usuário (modelagem em aberto do Q3 — follow-up).
    /// </summary>
    private async Task<int> ResolveFeePercentBpsAsync(
        Application.Features.Payouts.PayoutAccountDto receiver, CancellationToken ct)
    {
        // 1º — override explícito na sub-conta.
        if (receiver.FeePercentBps is { } accountOverride)
            return accountOverride;

        // 2º — recebedor é a clínica (TEAM): usa a fee do plano da assinatura.
        if (receiver.OwnerType == PayoutOwnerType.TEAM)
        {
            var sub = await db.Subscriptions.AsNoTracking()
                .Where(s => s.TeamId == receiver.OwnerId)
                .Select(s => new { s.DefaultFeeBps, s.PlanCode })
                .FirstOrDefaultAsync(ct);
            if (sub?.DefaultFeeBps is { } bps) return bps;
            if (!string.IsNullOrEmpty(sub?.PlanCode)) return PlanCatalog.FeeBpsFor(sub!.PlanCode);
            return PlanCatalog.ClinicaFeeBps; // clínica sem assinatura mapeada → taxa base de clínica
        }

        // 3º — recebedor individual (USER): usa a assinatura individual (Solo Pro = 5%), se ativa;
        // senão, plano free Solo (10%). Só vale o plano quando a assinatura está viva.
        var userSub = await db.UserSubscriptions.AsNoTracking()
            .Where(s => s.UserId == receiver.OwnerId)
            .Select(s => new { s.Status, s.DefaultFeeBps, s.PlanCode })
            .FirstOrDefaultAsync(ct);

        var live = (userSub?.Status ?? "").Trim().ToLowerInvariant() is "active" or "trialing";
        if (live)
        {
            if (userSub!.DefaultFeeBps is { } bps) return bps;
            if (!string.IsNullOrEmpty(userSub.PlanCode)) return PlanCatalog.FeeBpsFor(userSub.PlanCode);
        }

        // Trial interno (D5, F4): enquanto vigente, o usuário usufrui do Solo Pro (5%), igual ao que o plano mostra.
        var trialEndsAt = await db.Users.AsNoTracking()
            .Where(u => u.Id == receiver.OwnerId).Select(u => u.TrialEndsAt).FirstOrDefaultAsync(ct);
        if (trialEndsAt is { } end && end > DateTime.UtcNow) return PlanCatalog.SoloProFeeBps;

        return PlanCatalog.SoloFeeBps;
    }

    public async Task<PaymentInitResult> InitiateAsync(
        string bookingUid, PaymentProvider provider, CancellationToken ct = default)
    {
        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.Uid == bookingUid, ct);
        if (booking is null)
            return new PaymentInitResult(PaymentInitOutcome.BookingNotFound, Message: "Agendamento não encontrado.");
        if (booking.PaymentStatus == PaymentStatus.PAID)
            return new PaymentInitResult(PaymentInitOutcome.AlreadyPaid, Message: "Consulta já paga.");

        var eventType = await db.EventTypes.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == booking.EventTypeId, ct);
        if (eventType?.Price is not > 0)
            return new PaymentInitResult(PaymentInitOutcome.NotPayable, Message: "Consulta sem preço definido.");

        var gross = eventType.Price.Value;

        // Recebedor do split (USER ou TEAM, §4.1) para o provedor escolhido.
        var receiver = await payouts.ResolveReceiverForEventTypeAsync(booking.EventTypeId, provider, ct);
        if (receiver is null || receiver.Status != PayoutAccountStatus.ACTIVE ||
            !receiver.ChargesEnabled || string.IsNullOrEmpty(receiver.ExternalAccountId))
        {
            return new PaymentInitResult(PaymentInitOutcome.NoActiveAccount,
                Message: "O profissional/clínica ainda não concluiu o cadastro de recebimentos.");
        }

        // Taxa dinâmica por prioridade (§4.3): override da sub-conta → plano da clínica → padrão da plataforma.
        var feePercentBps = await ResolveFeePercentBpsAsync(receiver, ct);
        var fee = FeeCalculator.Compute(new FeeInput(
            GrossCents: gross,
            FeePercentBps: feePercentBps,
            FeeFixedCents: receiver.FeeFixedCents ?? DefaultFeeFixedCents,
            GatewayCostCents: 0,
            AbsorbGatewayCost: receiver.AbsorbGatewayCost));

        var splitService = splitProviders.FirstOrDefault(s => s.Provider == provider);
        if (splitService is null)
            return new PaymentInitResult(PaymentInitOutcome.ProviderError, Message: $"Provedor {provider} indisponível.");

        var charge = await splitService.CreateChargeAsync(new SplitChargeRequest(
            GrossCents: gross,
            ApplicationFeeCents: fee.PlatformFeeCents,
            DestinationAccountId: receiver.ExternalAccountId!,
            Currency: eventType.Currency,
            BookingUid: booking.Uid,
            Description: $"Consulta: {eventType.Title}",
            GuestEmail: booking.GuestEmail), ct);

        if (charge is null)
            return new PaymentInitResult(PaymentInitOutcome.ProviderError, Message: "Falha ao iniciar o pagamento.");

        // Snapshot financeiro (confirmado como PAID apenas no webhook). §5.4/§6.2.
        booking.PriceCents ??= gross;
        booking.Currency = eventType.Currency;
        booking.PaymentProvider = provider;
        booking.PayoutAccountId = receiver.Id;
        booking.PlatformFeeCents = fee.PlatformFeeCents;
        booking.NetToProviderCents = fee.NetToProviderCents;
        booking.ProviderPaymentId = charge.ProviderPaymentId;
        booking.PaymentStatus = PaymentStatus.PENDING;
        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "[Payments] Cobrança iniciada booking={Uid} provider={Provider} gross={Gross} fee={Fee}",
            booking.Uid, provider, gross, fee.PlatformFeeCents);

        return new PaymentInitResult(
            PaymentInitOutcome.Success, provider, charge.ProviderPaymentId, charge.ClientSecret,
            gross, fee.PlatformFeeCents,
            PixQrCode: charge.PixQrCode,
            PixQrCodeBase64: charge.PixQrCodeBase64,
            PixTicketUrl: charge.PixTicketUrl);
    }
}
