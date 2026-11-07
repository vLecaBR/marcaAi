using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.Bookings;

/// <summary>Item da lista de consultas do profissional (dashboard).</summary>
public sealed record BookingListItemDto(
    string Uid,
    string GuestName,
    string GuestEmail,
    string? GuestPhone,
    DateTimeOffset StartTime,
    DateTimeOffset EndTime,
    BookingStatus Status,
    string EventTitle,
    string? MeetingUrl,
    PaymentStatus PaymentStatus);

/// <summary>Detalhe público da consulta (página de confirmação por uid).</summary>
public sealed record BookingDetailDto(
    string Uid,
    string GuestName,
    string GuestEmail,
    DateTimeOffset StartTime,
    DateTimeOffset EndTime,
    BookingStatus Status,
    string EventTitle,
    string OwnerName,
    string? MeetingUrl,
    string GuestTimeZone,
    // Campos para pagar, remarcar e "adicionar à agenda" na página pública da consulta.
    string? OwnerId = null,
    string? OwnerUsername = null,
    string? EventTypeId = null,
    string? EventSlug = null,
    string? LocationType = null,
    string? LocationDetail = null,
    int? PriceCents = null,
    bool PayOnSite = false,
    string? PaymentStatus = null,
    DateTimeOffset? PaymentDueAt = null,
    int RescheduleCount = 0,
    int? BookingLimitDays = null);
