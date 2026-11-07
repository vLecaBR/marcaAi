using MarcaAi.Application.Features.Notifications;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Orquestra notificações de consulta (e-mail ao paciente e ao profissional + WhatsApp).</summary>
public interface INotificationService
{
    /// <summary>Consulta criada: confirma (ou avisa pendente, se requer confirmação) o paciente e notifica o profissional.</summary>
    Task NotifyBookingCreatedAsync(BookingNotification n, CancellationToken cancellationToken = default);

    /// <summary>Reserva de consulta paga criada: avisa o paciente do valor e do prazo para pagar (o profissional só é avisado após o pagamento).</summary>
    Task NotifyBookingPendingPaymentAsync(BookingNotification n, CancellationToken cancellationToken = default);

    /// <summary>Consulta remarcada: avisa paciente e profissional com o horário antigo e o novo.</summary>
    Task NotifyBookingRescheduledAsync(BookingNotification n, DateTime oldStartUtc, CancellationToken cancellationToken = default);

    Task NotifyBookingCancelledAsync(BookingNotification n, string? reason, CancellationToken cancellationToken = default);

    /// <param name="allowWhatsApp">
    /// Se false, o lembrete por WhatsApp é omitido (o profissional não tem o recurso `whatsapp_reminders`
    /// no plano — enforcement premium do Q7). O e-mail é sempre enviado.
    /// </param>
    Task NotifyBookingReminderAsync(BookingNotification n, bool allowWhatsApp = true, CancellationToken cancellationToken = default);
}
