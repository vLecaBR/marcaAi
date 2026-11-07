using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Notifications;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Jobs;

/// <summary>
/// Cancela (SYSTEM) as reservas de consulta paga online que passaram do prazo sem pagamento, liberando o horário
/// (D14). Tolerância de 2 min após o prazo para um pagamento que acabou de ser feito chegar pelo webhook. Se o pagamento
/// ainda chegar depois, <c>IBookingService.OnPaymentConfirmedAsync</c> reembolsa.
/// </summary>
public sealed class ExpireUnpaidBookingsJob(
    ApplicationDbContext db, INotificationService notify, ILogger<ExpireUnpaidBookingsJob> logger) : IExpireUnpaidBookingsJob
{
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(2);

    public async Task<int> RunAsync(CancellationToken cancellationToken = default)
    {
        var limit = DateTime.UtcNow - Grace;
        var expired = await db.Bookings
            .Include(b => b.EventType).Include(b => b.Owner)
            .Where(b => b.Status == BookingStatus.PENDING
                        && b.PaymentDueAt != null && b.PaymentDueAt < limit
                        && b.PaymentStatus != PaymentStatus.PAID)
            .OrderBy(b => b.PaymentDueAt).ThenBy(b => b.Id)
            .Take(100)
            .ToListAsync(cancellationToken);
        if (expired.Count == 0) return 0;

        const string reason = "Pagamento não realizado no prazo.";
        foreach (var b in expired)
        {
            b.Status = BookingStatus.CANCELLED;
            b.CancelReason = reason;
            b.CanceledAt = DateTime.UtcNow;
            b.CanceledBy = CanceledBy.SYSTEM;
        }
        await db.SaveChangesAsync(cancellationToken);

        foreach (var b in expired)
        {
            try
            {
                await notify.NotifyBookingCancelledAsync(new BookingNotification(
                    b.Uid, b.GuestName, b.GuestEmail, b.GuestPhone,
                    b.Owner.Name ?? "Profissional", b.Owner.Email,
                    b.EventType.Title, b.StartTime, b.EndTime,
                    b.GuestTimeZone, b.Owner.TimeZone,
                    b.EventType.LocationType, b.MeetingUrl, b.EventType.RequiresConfirm),
                    reason + " O horário foi liberado.", cancellationToken);
            }
            catch (Exception ex) { logger.LogWarning(ex, "[Expire] Notificação falhou para {Uid}", b.Uid); }
        }

        logger.LogInformation("[Expire] {Count} reserva(s) sem pagamento expirada(s).", expired.Count);
        return expired.Count;
    }
}
