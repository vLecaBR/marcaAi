using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.Public;

public sealed record PublicEventTypeDto(
    string Id, string Title, string Slug, string? Description,
    int Duration, EventTypeColor Color, LocationType LocationType, int? Price, string Currency,
    bool RequiresConfirm, int BeforeEventBuffer, int AfterEventBuffer, int? BookingLimitDays);

/// <summary>Id = id do profissional (ownerId usado em /slots e /bookings). Nunca expor e-mail aqui.</summary>
public sealed record PublicProfileDto(
    string Id,
    string Username,
    string? Name,
    string? Bio,
    string? Image,
    string? BrandColor,
    Theme Theme,
    string TimeZone,
    IReadOnlyList<PublicEventTypeDto> EventTypes);
