using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Billing;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Stripe;
using Stripe.Checkout;

namespace MarcaAi.Infrastructure.Billing;

/// <summary>
/// Assinatura individual do profissional (Solo Pro) via Stripe Billing. Estrutura separada da
/// clínica (Q7): checkout com metadata `userId` (o webkook em <see cref="StripeBillingService"/>
/// faz o upsert da <c>UserSubscription</c>). Leitura de status rico para o dashboard individual.
/// </summary>
public sealed class UserBillingService(
    ApplicationDbContext db, IConfiguration config, ILogger<UserBillingService> logger) : IUserBillingService
{
    private string AppUrl => (config["App:PublicUrl"] ?? "http://localhost:3000").TrimEnd('/');

    /// <summary>PlanCode individual → price_id do Stripe (só planos pagos individuais).</summary>
    private string? PriceIdFor(string planCode) => planCode.Trim().ToUpperInvariant() switch
    {
        PlanCatalog.SoloPro => config["Stripe:Prices:SoloPro"],
        _ => null,
    };

    public async Task<CheckoutResult> CreateCheckoutAsync(string userId, string planCode, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(config["Stripe:SecretKey"]))
            return new CheckoutResult(false, Error: "Stripe não configurado.", StatusCode: 503);

        // Só planos **individuais pagos** (ex.: SOLO_PRO). Solo (free) e planos de clínica não entram aqui.
        if (PlanCatalog.IsClinicPlan(planCode) || !PlanCatalog.IsPaid(planCode))
            return new CheckoutResult(false, Error: "Plano individual inválido para checkout.", StatusCode: 422);

        var priceId = PriceIdFor(planCode);
        if (string.IsNullOrWhiteSpace(priceId))
            return new CheckoutResult(false, Error: "Preço do plano individual não configurado.", StatusCode: 503);

        StripeConfiguration.ApiKey = config["Stripe:SecretKey"];
        var existing = await db.UserSubscriptions.FirstOrDefaultAsync(s => s.UserId == userId, ct);

        try
        {
            // Já é cliente → portal de gerenciamento.
            if (!string.IsNullOrWhiteSpace(existing?.StripeCustomerId))
            {
                var portal = await new Stripe.BillingPortal.SessionService().CreateAsync(
                    new Stripe.BillingPortal.SessionCreateOptions
                    {
                        Customer = existing!.StripeCustomerId,
                        ReturnUrl = $"{AppUrl}/dashboard/plans",
                    }, cancellationToken: ct);
                return new CheckoutResult(true, portal.Url);
            }

            var session = await new SessionService().CreateAsync(new SessionCreateOptions
            {
                Mode = "subscription",
                LineItems = new List<SessionLineItemOptions> { new() { Price = priceId, Quantity = 1 } },
                SuccessUrl = $"{AppUrl}/dashboard/plans?success=true",
                CancelUrl = $"{AppUrl}/dashboard/plans?canceled=true",
                Metadata = new Dictionary<string, string> { ["userId"] = userId, ["planCode"] = planCode.ToUpperInvariant() },
            }, cancellationToken: ct);

            return new CheckoutResult(true, session.Url);
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "[Stripe] Falha ao criar checkout individual para {UserId}", userId);
            return new CheckoutResult(false, Error: "Falha ao iniciar o pagamento.", StatusCode: 502);
        }
    }

    public async Task<BillingStatusDto> GetStatusAsync(string userId, CancellationToken ct = default)
    {
        var sub = await db.UserSubscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.UserId == userId, ct);
        var userTrialEnds = await db.Users.AsNoTracking()
            .Where(x => x.Id == userId).Select(x => x.TrialEndsAt).FirstOrDefaultAsync(ct);
        var (planCode, active, status) = BillingStatusMapper.EffectiveWithTrial(
            sub?.Status, sub?.PlanCode, userTrialEnds, TrialPolicy.UserPlan);

        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);

        // Uso individual: bookings do profissional no mês + tipos de consulta pessoais (sem clínica).
        var bookings = await db.Bookings.CountAsync(
            b => b.UserId == userId && b.StartTime >= monthStart && b.StartTime < monthEnd, ct);
        var eventTypes = await db.EventTypes.CountAsync(e => e.UserId == userId && e.TeamId == null, ct);

        return new BillingStatusDto(
            TeamId: "",
            PlanCode: planCode,
            Status: status,
            Active: active,
            CurrentPeriodEnd: sub?.StripeCurrentPeriodEnd,
            Trial: BillingStatusMapper.Trial(status == "TRIALING" ? "trialing" : sub?.Status, sub?.TrialEndsAt ?? userTrialEnds),
            Usage: new PlanUsageDto(bookings, 1, eventTypes),
            Limits: BillingStatusMapper.Limits(planCode));
    }
}
