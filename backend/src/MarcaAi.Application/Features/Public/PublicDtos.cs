using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.Public;

public sealed record PublicQuestionDto(string Id, string Label, QuestionType Type, string? Placeholder, bool Required, int Order);

public sealed record PublicEventTypeDto(
    string Id, string Title, string Slug, string? Description,
    int Duration, EventTypeColor Color, LocationType LocationType, int? Price, string Currency,
    bool RequiresConfirm, int BeforeEventBuffer, int AfterEventBuffer, int? BookingLimitDays,
    IReadOnlyList<PublicQuestionDto> Questions, bool PayOnSite = false);

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

/// <summary>Profissional exibido na página pública da clínica. Nunca expõe e-mail.</summary>
public sealed record PublicTeamMemberDto(string Username, string? Name, string? Image, string? Specialty, string? Council);

public sealed record PublicTeamDto(
    string Slug, string Name, string? Description, string? Logo, string? BrandColor, Theme Theme,
    IReadOnlyList<PublicTeamMemberDto> Professionals);
