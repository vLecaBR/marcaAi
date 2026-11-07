namespace MarcaAi.Application.Features.Payments;

/// <summary>Cobrança PIX gerada (QR + copia-e-cola).</summary>
public sealed record PixCharge(string Id, string? QrCodeBase64, string? QrCode, string? TicketUrl);

/// <summary>Status de um pagamento consultado no provedor (inclui valor, para conferir contra o booking).</summary>
public sealed record PaymentStatusInfo(string Status, string? ExternalReference, int? AmountCents = null);
