using MarcaAi.Domain.Enums;

namespace MarcaAi.Domain.Entities;

/// <summary>Consulta/Sessão agendada. Tabela "bookings".</summary>
public class Booking
{
    public string Id { get; set; } = default!;
    public string Uid { get; set; } = default!;        // id público (URL de confirmação)
    public string UserId { get; set; } = default!;     // profissional dono da agenda
    public string EventTypeId { get; set; } = default!;

    // Dados do paciente
    public string GuestName { get; set; } = default!;
    public string GuestEmail { get; set; } = default!;
    public string? GuestPhone { get; set; }
    public string? GuestNotes { get; set; }

    // Janela sempre em UTC
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public string GuestTimeZone { get; set; } = default!;

    public BookingStatus Status { get; set; } = BookingStatus.PENDING;

    public string? CancelReason { get; set; }
    public DateTime? CanceledAt { get; set; }
    public CanceledBy? CanceledBy { get; set; }

    public string? MeetingUrl { get; set; }
    public string? MeetingId { get; set; }

    public bool ReminderSent { get; set; }

    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.UNPAID;
    public string? PaymentReference { get; set; }   // legado; ProviderPaymentId é o canônico

    // --- Snapshot financeiro do split (imutável após PAID). Ver financial-split-spec.md §5.4. ---
    /// <summary>Preço cobrado, em centavos (snapshot do EventType.Price no momento da cobrança).</summary>
    public int? PriceCents { get; set; }
    public string Currency { get; set; } = "BRL";

    public PaymentProvider? PaymentProvider { get; set; }
    /// <summary>Sub-conta que recebeu o repasse líquido.</summary>
    public string? PayoutAccountId { get; set; }

    /// <summary>Taxa da plataforma MarcaAí retida, em centavos.</summary>
    public int? PlatformFeeCents { get; set; }
    /// <summary>Custo do gateway, em centavos (quando conhecido).</summary>
    public int? GatewayFeeCents { get; set; }
    /// <summary>Valor líquido repassado ao profissional/clínica, em centavos.</summary>
    public int? NetToProviderCents { get; set; }

    /// <summary>Id canônico do pagamento no provedor.</summary>
    public string? ProviderPaymentId { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime? RefundedAt { get; set; }

    public string? RecurringEventId { get; set; }
    public int? RecurringIndex { get; set; }

    // Consentimento do titular (paciente) no agendamento — LGPD Arts. 8º e 11. Registrado no ato.
    public DateTime? ConsentAt { get; set; }
    public string? ConsentVersion { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = default!;
    public EventType EventType { get; set; } = default!;
    public ICollection<BookingResponse> Responses { get; set; } = new List<BookingResponse>();
}
