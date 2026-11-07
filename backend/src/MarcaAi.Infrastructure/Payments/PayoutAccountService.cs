using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Payouts;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>
/// Implementação da gestão de sub-contas de recebimento usando a estratégia de ownership
/// polimórfico (OwnerType + OwnerId) — sem propriedade de navegação em User/Team.
/// Cria/consulta as PayoutAccount, resolve o recebedor e dispara o onboarding real do provedor
/// (Account Link do Stripe Connect) via <see cref="IConnectOnboardingService"/>.
/// </summary>
public sealed class PayoutAccountService(
    IApplicationDbContext db,
    IEnumerable<IConnectOnboardingService> onboardingProviders,
    IMercadoPagoConnectService mercadoPago,
    ILogger<PayoutAccountService> logger) : IPayoutAccountService
{
    public async Task<OnboardingResult> StartOnboardingAsync(
        PayoutOwnerType ownerType, string ownerId, PaymentProvider provider, CancellationToken ct = default)
    {
        // Idempotente por (OwnerType, OwnerId, Provider): reutiliza a conta pendente se já existir.
        var account = await db.PayoutAccounts.FirstOrDefaultAsync(
            a => a.OwnerType == ownerType && a.OwnerId == ownerId && a.Provider == provider, ct);

        if (account is null)
        {
            account = new PayoutAccount
            {
                OwnerType = ownerType,
                OwnerId = ownerId,
                Provider = provider,
                Status = PayoutAccountStatus.PENDING,
                ExternalAccountId = string.Empty,
            };
            db.PayoutAccounts.Add(account);
            await db.SaveChangesAsync(ct);
            logger.LogInformation(
                "[Payouts] Onboarding iniciado: owner={OwnerType}/{OwnerId} provider={Provider} account={AccountId}",
                ownerType, ownerId, provider, account.Id);
        }

        // Conta já liberada: nada a fazer (idempotente) — não gera novo Account Link.
        if (account.Status == PayoutAccountStatus.ACTIVE)
            return new OnboardingResult(account.Id, account.Provider, account.Status, account.OnboardingUrl);

        // Onboarding real do provedor (se houver implementação registrada e configurada). Reutiliza o
        // ExternalAccountId existente para não duplicar a conta no gateway em retomadas de KYC.
        var onboarding = onboardingProviders.FirstOrDefault(p => p.Provider == provider);
        if (onboarding is not null)
        {
            var existingExternalId = string.IsNullOrEmpty(account.ExternalAccountId) ? null : account.ExternalAccountId;
            var result = await onboarding.CreateOnboardingLinkAsync(existingExternalId, $"{ownerType}:{ownerId}", ct);

            switch (result.Outcome)
            {
                case OnboardingLinkOutcome.Success:
                    account.ExternalAccountId = result.ExternalAccountId!;
                    account.OnboardingUrl = result.OnboardingUrl;
                    await db.SaveChangesAsync(ct);
                    break;

                // Não mascara mais a causa (bug 3): propaga config vs falha do provedor para o controller
                // mapear 503/502. A conta segue PENDING, mas o chamador recebe o motivo acionável.
                case OnboardingLinkOutcome.NotConfigured:
                    logger.LogWarning(
                        "[Payouts] Onboarding {Provider} indisponível por config ({Code}) para owner {OwnerType}/{OwnerId}.",
                        provider, result.ErrorCode, ownerType, ownerId);
                    return new OnboardingResult(account.Id, account.Provider, account.Status, null,
                        OnboardingOutcome.NotConfigured, result.ErrorCode, result.Message);

                case OnboardingLinkOutcome.ProviderError:
                    logger.LogError(
                        "[Payouts] Provider {Provider} recusou onboarding ({Code}) para owner {OwnerType}/{OwnerId}.",
                        provider, result.ErrorCode, ownerType, ownerId);
                    return new OnboardingResult(account.Id, account.Provider, account.Status, null,
                        OnboardingOutcome.ProviderError, result.ErrorCode, result.Message);
            }
        }
        else
        {
            // Sem implementação para o provedor (ex.: Mercado Pago v1): mantém o esqueleto PENDING.
            logger.LogInformation("[Payouts] Sem onboarding registrado para {Provider}; conta segue PENDING.", provider);
        }

        return new OnboardingResult(account.Id, account.Provider, account.Status, account.OnboardingUrl);
    }

    public async Task<IReadOnlyList<PayoutAccountDto>> GetAccountsForOwnerAsync(
        PayoutOwnerType ownerType, string ownerId, CancellationToken ct = default)
    {
        var accounts = await db.PayoutAccounts
            .Where(a => a.OwnerType == ownerType && a.OwnerId == ownerId)
            .OrderBy(a => a.Provider)
            .ToListAsync(ct);
        return accounts.Select(ToDto).ToList();
    }

    public async Task<PayoutAccountDto?> GetAccountAsync(
        PayoutOwnerType ownerType, string ownerId, PaymentProvider provider, CancellationToken ct = default)
    {
        var account = await db.PayoutAccounts.FirstOrDefaultAsync(
            a => a.OwnerType == ownerType && a.OwnerId == ownerId && a.Provider == provider, ct);
        return account is null ? null : ToDto(account);
    }

    public async Task<PayoutAccountDto?> ResolveReceiverForEventTypeAsync(
        string eventTypeId, PaymentProvider provider, CancellationToken ct = default)
    {
        // EventType com TeamId → recebedor = clínica (TEAM); sem TeamId → profissional (USER). §4.1
        var et = await db.EventTypes
            .Where(x => x.Id == eventTypeId)
            .Select(x => new { x.UserId, x.TeamId })
            .FirstOrDefaultAsync(ct);
        if (et is null) return null;

        var (ownerType, ownerId) = et.TeamId is { Length: > 0 } teamId
            ? (PayoutOwnerType.TEAM, teamId)
            : (PayoutOwnerType.USER, et.UserId);

        return await GetAccountAsync(ownerType, ownerId, provider, ct);
    }

    public async Task<bool> DisconnectAsync(string payoutAccountId, CancellationToken ct = default)
    {
        var account = await db.PayoutAccounts.FirstOrDefaultAsync(a => a.Id == payoutAccountId, ct);
        if (account is null) return false;

        account.Status = PayoutAccountStatus.DISABLED;
        account.ChargesEnabled = false;
        account.PayoutsEnabled = false;
        await db.SaveChangesAsync(ct);
        // Mercado Pago: descarta os tokens OAuth do vendedor. Stripe: a conta Express fica no Stripe, mas deixa
        // de receber cobranças daqui (Status DISABLED); o encerramento definitivo é feito no dashboard do Stripe.
        if (account.Provider == PaymentProvider.MERCADO_PAGO)
            await mercadoPago.RevokeAsync(account.Id, ct);
        return true;
    }

    private static PayoutAccountDto ToDto(PayoutAccount a) => new(
        a.Id, a.OwnerType, a.OwnerId, a.Provider,
        string.IsNullOrEmpty(a.ExternalAccountId) ? null : a.ExternalAccountId,
        a.Status, a.ChargesEnabled, a.PayoutsEnabled, a.OnboardingUrl,
        a.FeePercentBps, a.FeeFixedCents, a.AbsorbGatewayCost, a.CreatedAt, a.UpdatedAt);
}
