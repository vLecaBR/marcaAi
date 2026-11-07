using MarcaAi.Domain.Enums;

namespace MarcaAi.Application.Features.EventTypes;

/// <summary>Entrada de criação/edição de um tipo de consulta/sessão.</summary>
public sealed record EventTypeInput
{
    public required string Title { get; init; }
    public required string Slug { get; init; }
    public string? Description { get; init; }
    public int Duration { get; init; }
    public EventTypeColor Color { get; init; } = EventTypeColor.VIOLET;
    public bool RequiresConfirm { get; init; }
    public int BeforeEventBuffer { get; init; }
    public int AfterEventBuffer { get; init; }
    public int? BookingLimitDays { get; init; }
    public LocationType LocationType { get; init; } = LocationType.GOOGLE_MEET;
    public string? LocationValue { get; init; }
    public int? Price { get; init; }          // centavos
    public string Currency { get; init; } = "BRL";
    /// <summary>true = valor informativo, cobrado no atendimento (sem pagamento online).</summary>
    public bool PayOnSite { get; init; }
    /// <summary>Perguntas do formulário público (pré-consulta). Null = não alterar (update); lista = substituir.</summary>
    public IReadOnlyList<QuestionInput>? Questions { get; init; }
}

public sealed record QuestionInput(string Label, QuestionType Type, string? Placeholder, bool Required, int Order);

public sealed record QuestionDto(string Id, string Label, QuestionType Type, string? Placeholder, bool Required, int Order);

/// <summary>Tipo de consulta completo (GET /event-types/{id}) para edição.</summary>
public sealed record EventTypeDetailDto(
    string Id, string Title, string Slug, string? Description, int Duration, EventTypeColor Color,
    bool IsActive, bool RequiresConfirm, int BeforeEventBuffer, int AfterEventBuffer, int? BookingLimitDays,
    LocationType LocationType, string? LocationValue, int? Price, string Currency,
    IReadOnlyList<QuestionDto> Questions, bool PayOnSite = false);
