using MarcaAi.Domain.Enums;

namespace MarcaAi.Domain.Entities;

/// <summary>Tipo de consulta/sessão oferecida (ex.: "Consulta inicial 50min"). Tabela "event_types".</summary>
public class EventType
{
    public string Id { get; set; } = default!;
    public string UserId { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Slug { get; set; } = default!;
    public string? Description { get; set; }
    public int Duration { get; set; }
    public EventTypeColor Color { get; set; } = EventTypeColor.VIOLET;
    public bool IsActive { get; set; } = true;
    public bool RequiresConfirm { get; set; }

    public int BeforeEventBuffer { get; set; }
    public int AfterEventBuffer { get; set; }
    public int? BookingLimitDays { get; set; }

    public LocationType LocationType { get; set; } = LocationType.GOOGLE_MEET;
    public string? LocationValue { get; set; }

    public int? Price { get; set; }          // centavos
    public string Currency { get; set; } = "BRL";

    /// <summary>
    /// true = o valor é só informativo e a cobrança acontece no atendimento ("pagar no local"): a consulta confirma na hora,
    /// sem fluxo de pagamento online e sem exigir conta de recebimento. false (padrão) com <see cref="Price"/> &gt; 0 = pagar para confirmar.
    /// </summary>
    public bool PayOnSite { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public string? TeamId { get; set; }

    public User User { get; set; } = default!;
    public Team? Team { get; set; }
    public ICollection<EventTypeQuestion> Questions { get; set; } = new List<EventTypeQuestion>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
