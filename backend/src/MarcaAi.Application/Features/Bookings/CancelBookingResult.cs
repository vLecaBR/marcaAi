namespace MarcaAi.Application.Features.Bookings;

public enum CancelOutcome { Success, NotFound, AlreadyCancelled }

public sealed record CancelBookingRequest(string? Reason, string? CanceledBy);

/// <summary>
/// <paramref name="Refund"/>: null (sem pagamento), REFUNDED (reembolsado), NOT_ELIGIBLE (fora da janela
/// de 24h da política) ou FAILED (provedor falhou; reembolsar manualmente).
/// </summary>
public sealed record CancelBookingResult(CancelOutcome Outcome, string? Message = null, string? Refund = null);

public enum ConfirmOutcome { Success, NotFound, Forbidden, NotPending }

public sealed record ConfirmBookingResult(ConfirmOutcome Outcome, string? Message = null);
