namespace MarcaAi.Application.Features.Bookings;

public enum RescheduleOutcome { Success, NotFound, NotAllowed, TooLate, LimitReached, InvalidDuration, Unavailable, Conflict }

/// <summary>Resultado da remarcação. <see cref="Data"/> traz a consulta com os novos horários.</summary>
public sealed record RescheduleBookingResult(RescheduleOutcome Outcome, string? Message = null, BookingConfirmationDto? Data = null);
