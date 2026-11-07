using MarcaAi.Application.Features.Payments;

namespace MarcaAi.Application.Features.Bookings;

public enum BookingOutcome { Success, EventNotFound, InvalidDuration, Unavailable, Conflict, ConsentRequired, InvalidResponses, PaymentUnavailable }

/// <summary>Confirmação de agendamento.</summary>
public sealed record BookingConfirmationDto(
    string Uid,
    DateTimeOffset StartTime,
    DateTimeOffset EndTime,
    string Status,
    bool RequiresConfirm,
    string EventTitle,
    string? MeetingUrl,
    PixCharge? Pix = null,
    /// <summary>true = consulta paga online: a reserva fica PENDING segurando o horário até <see cref="PaymentDueAt"/>.</summary>
    bool PaymentRequired = false,
    DateTimeOffset? PaymentDueAt = null,
    int? PriceCents = null);

public sealed record CreateBookingResult(
    BookingOutcome Outcome,
    BookingConfirmationDto? Data = null,
    string? Message = null)
{
    public static CreateBookingResult Success(BookingConfirmationDto data) => new(BookingOutcome.Success, data);
    public static CreateBookingResult EventNotFound() =>
        new(BookingOutcome.EventNotFound, Message: "Tipo de evento não encontrado ou inativo.");
    public static CreateBookingResult InvalidDuration(int expected) =>
        new(BookingOutcome.InvalidDuration, Message: $"Duração inválida. Esperado: {expected} min.");
    public static CreateBookingResult Unavailable() =>
        new(BookingOutcome.Unavailable, Message: "Este horário está fora da disponibilidade do profissional.");
    public static CreateBookingResult ConsentRequired() =>
        new(BookingOutcome.ConsentRequired, Message: "É necessário aceitar o aviso de privacidade para agendar.");
    public static CreateBookingResult InvalidResponses(string detail) =>
        new(BookingOutcome.InvalidResponses, Message: detail);
    public static CreateBookingResult PaymentUnavailable() =>
        new(BookingOutcome.PaymentUnavailable, Message: "Este profissional ainda não ativou os recebimentos online. Entre em contato com ele para agendar.");
    public static CreateBookingResult Conflict() =>
        new(BookingOutcome.Conflict, Message: "Este horário acabou de ser reservado. Escolha outro horário.");
}
