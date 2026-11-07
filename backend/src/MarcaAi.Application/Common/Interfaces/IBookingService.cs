using MarcaAi.Application.Features.Bookings;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Criação e cancelamento de agendamento.</summary>
public interface IBookingService
{
    Task<CreateBookingResult> CreateAsync(CreateBookingRequest request, CancellationToken cancellationToken = default);

    /// <summary>Cancela a consulta pelo uid público e remove o evento do Google (best-effort).</summary>
    /// <remarks>
    /// <paramref name="actorUserId"/> = usuário autenticado (ou null se anônimo). O papel "OWNER" só vale se o ator
    /// for o dono/gestor; o campo <c>canceledBy</c> do corpo é ignorado para essa decisão. Política D6: consulta paga
    /// é reembolsada integralmente se cancelada com 24h+ de antecedência, ou sempre que o cancelamento é do profissional.
    /// </remarks>
    Task<CancelBookingResult> CancelAsync(string uid, string? reason, string? canceledBy, string? actorUserId = null, CancellationToken cancellationToken = default);

    /// <summary>Aprova uma consulta PENDING (dono ou gestor da clínica): cria evento no Google e notifica o paciente.</summary>
    /// <summary>
    /// Remarca a consulta para outro horário livre. O paciente (anônimo, pelo link) só remarca com 24h+ de antecedência e
    /// até 2 vezes (D15); o dono/gestor remarca sem esses limites. Revalida disponibilidade e conflito.
    /// </summary>
    Task<RescheduleBookingResult> RescheduleAsync(string uid, DateTimeOffset newStartUtc, DateTimeOffset newEndUtc, string? actorUserId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Baixa de pagamento confirmada pelo provedor: confirma a consulta (se não exigir aprovação), cria o evento no Google e
    /// notifica. Se a reserva já expirou (cancelada) e o pagamento chegou tarde, reembolsa. Idempotente.
    /// </summary>
    Task OnPaymentConfirmedAsync(string uid, CancellationToken cancellationToken = default);

    Task<ConfirmBookingResult> ConfirmAsync(string uid, string actorUserId, CancellationToken cancellationToken = default);
}
