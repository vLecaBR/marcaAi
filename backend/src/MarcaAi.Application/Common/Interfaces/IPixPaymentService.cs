using MarcaAi.Application.Features.Payments;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Cobrança PIX de consultas (Mercado Pago). Retorna null se não configurado.</summary>
public interface IPixPaymentService
{
    Task<PixCharge?> CreateAsync(
        decimal amountReais, string description, string payerEmail, string payerFirstName,
        string externalReference, CancellationToken cancellationToken = default);

    /// <summary>
    /// Consulta um pagamento pelo id (para o webhook). Em split o pagamento vive na conta do vendedor:
    /// passe o <paramref name="accessToken"/> dele. Sem token usa o do marketplace. Null se não configurado/erro.
    /// </summary>
    Task<PaymentStatusInfo?> GetPaymentAsync(
        string paymentId, string? accessToken = null, CancellationToken cancellationToken = default);
}
