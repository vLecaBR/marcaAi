using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Payments;
using MarcaAi.Domain.Enums;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>
/// Provedor de pagamento SIMULADO (<c>Payments:Provider=Fake</c>), só para desenvolvimento e testes: permite exercitar a jornada
/// paga inteira (reserva → pagar → confirmar → expirar → reembolsar) sem conta Stripe. Substitui o split e o onboarding do Stripe
/// (provedor STRIPE). A "baixa" é feita pelo endpoint de desenvolvimento, que usa o mesmo caminho do webhook real.
/// NUNCA em produção: o <c>ProductionConfigValidator</c> recusa o boot.
/// </summary>
public sealed class FakePaymentProvider : ISplitPaymentService, IConnectOnboardingService
{
    public const string PaymentIdPrefix = "pi_fake_";
    public const string SecretPrefix = "fake_secret_";

    public PaymentProvider Provider => PaymentProvider.STRIPE;

    public Task<SplitChargeResult?> CreateChargeAsync(SplitChargeRequest request, CancellationToken cancellationToken = default) =>
        Task.FromResult<SplitChargeResult?>(new SplitChargeResult(
            PaymentIdPrefix + request.BookingUid, SecretPrefix + request.BookingUid, "requires_payment_method"));

    public Task<RefundResult?> RefundAsync(string providerPaymentId, int? amountCents = null, CancellationToken cancellationToken = default) =>
        Task.FromResult<RefundResult?>(new RefundResult("re_fake_" + providerPaymentId, "succeeded", amountCents ?? 0));

    public Task<ConnectOnboardingResult> CreateOnboardingLinkAsync(
        string? existingExternalAccountId, string ownerReference, CancellationToken cancellationToken = default) =>
        Task.FromResult(ConnectOnboardingResult.Ok(
            string.IsNullOrEmpty(existingExternalAccountId) ? "acct_fake_" + Guid.NewGuid().ToString("N")[..12] : existingExternalAccountId,
            "about:blank#modo-simulado"));
}
