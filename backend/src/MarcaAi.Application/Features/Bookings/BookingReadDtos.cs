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
    BookingEventTypeDto EventType,
    string? MeetingUrl,
    PaymentStatus PaymentStatus);

/// <summary>Tipo de consulta resumido (título, cor e duração) embutido na lista — o front lê <c>eventType.title</c>.</summary>
public sealed record BookingEventTypeDto(string Title, EventTypeColor Color, int Duration, LocationType LocationType);

/// <summary>Página de resultados: <c>total</c> é o total do filtro (não só da página).</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    public static (int Page, int PageSize) Normalize(int? page, int? pageSize) =>
        (Math.Max(1, page ?? 1), Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize));
}

/// <summary>Contagens para as abas e cartões do dashboard, sem baixar a lista inteira.</summary>
public sealed record BookingSummaryDto(
    int Total, int Confirmed, int Pending, int Cancelled,
    int Upcoming, int PendingApproval, int Past, int CancelledOrExpired,
    IReadOnlyList<BookingListItemDto> NextUp);

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
