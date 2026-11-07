using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.Notifications;

/// <summary>Dados para notificar sobre uma consulta (e-mail + WhatsApp).</summary>
public sealed record BookingNotification(
    string Uid,
    string GuestName,
    string GuestEmail,
    string? GuestPhone,
    string OwnerName,
    string OwnerEmail,
    string EventTitle,
    DateTime StartTimeUtc,
    DateTime EndTimeUtc,
    string GuestTimeZone,
    string OwnerTimeZone,
    LocationType LocationType,
    string? LocationDetail,   // Meet link (online) OU endereço (presencial)
    bool RequiresConfirm,
    DateTime? PaymentDueAtUtc = null,   // reserva paga: prazo para pagar
    int? PriceCents = null);
