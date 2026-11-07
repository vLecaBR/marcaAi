using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.EventTypes;

/// <summary>Resumo de um tipo de consulta/sessão para listagem. Enums serializados como string.</summary>
public sealed record EventTypeSummaryDto
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Slug { get; init; }
    public string? Description { get; init; }
    public int Duration { get; init; }
    public EventTypeColor Color { get; init; }
    public bool IsActive { get; init; }
    public bool RequiresConfirm { get; init; }
    public LocationType LocationType { get; init; }
    public int? Price { get; init; }          // centavos
    public required string Currency { get; init; }
    public int BookingCount { get; init; }
    public bool PayOnSite { get; init; }
}
