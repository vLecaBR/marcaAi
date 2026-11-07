using MarcaAi.Application.Features.Payouts;
using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Gestão das sub-contas de recebimento (Mercado Pago Split / Stripe Connect):
/// onboarding/KYC, consulta de status e resolução do recebedor de uma transação.
/// Provider-agnóstica; a integração concreta com cada gateway entra nas Fases 2/3.
/// Ver financial-split-spec.md §7.1.
/// </summary>
public interface IPayoutAccountService
{
    /// <summary>
    /// Inicia (ou retoma) o onboarding da sub-conta do owner para o provedor indicado.
    /// Cria uma <c>PayoutAccount</c> em estado PENDING se ainda não existir. Idempotente por
    /// (OwnerType, OwnerId, Provider). No esqueleto Fase 2 não dispara OAuth/Account Link real.
    /// </summary>
    Task<OnboardingResult> StartOnboardingAsync(
        PayoutOwnerType ownerType, string ownerId, PaymentProvider provider,
        CancellationToken cancellationToken = default);

    /// <summary>Lista as sub-contas de um owner (todos os provedores). Vazio se não houver.</summary>
    Task<IReadOnlyList<PayoutAccountDto>> GetAccountsForOwnerAsync(
        PayoutOwnerType ownerType, string ownerId,
        CancellationToken cancellationToken = default);

    /// <summary>Retorna a sub-conta do owner para um provedor específico, ou null.</summary>
    Task<PayoutAccountDto?> GetAccountAsync(
        PayoutOwnerType ownerType, string ownerId, PaymentProvider provider,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resolve o recebedor do split a partir do <c>EventType</c> do booking:
    /// EventType com TeamId → recebedor = TEAM; sem TeamId → recebedor = USER
    /// (financial-split-spec.md §4.1). Null se o EventType não existir.
    /// </summary>
    Task<PayoutAccountDto?> ResolveReceiverForEventTypeAsync(
        string eventTypeId, PaymentProvider provider,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// true se o recebedor do tipo de consulta (profissional ou clínica) tem alguma sub-conta ACTIVE com cobranças habilitadas.
    /// Usado para impedir publicar/agendar serviço pago online sem conta de recebimento.
    /// </summary>
    Task<bool> HasActiveReceiverAsync(PayoutOwnerType ownerType, string ownerId, CancellationToken cancellationToken = default);

    /// <summary>Idem, resolvendo o recebedor a partir de um tipo de consulta existente.</summary>
    Task<bool> HasActiveReceiverForEventTypeAsync(string eventTypeId, CancellationToken cancellationToken = default);

    /// <summary>Desconecta (desabilita) uma sub-conta. True se encontrada e desabilitada.</summary>
    Task<bool> DisconnectAsync(
        string payoutAccountId,
        CancellationToken cancellationToken = default);
}
