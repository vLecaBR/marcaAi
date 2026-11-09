using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Notifications;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Jobs;

/// <summary>
/// Job recorrente (Hangfire): envia lembretes das consultas CONFIRMED que começam nas próximas
/// 2 horas e ainda não foram lembradas. Marca reminderSent=true. Porte do cron/reminders do Next.
/// </summary>
public sealed class ReminderJob(
    ApplicationDbContext db, INotificationService notify, IPlanAccessService plans,
    ILogger<ReminderJob> logger) : IReminderJob
{
    public async Task DispatchDueAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var until = now.AddHours(2);

        var due = await db.Bookings
            .Include(b => b.EventType)
            .Include(b => b.Owner)
            .Where(b => b.Status == BookingStatus.CONFIRMED
                        && !b.ReminderSent
                        && b.StartTime >= now && b.StartTime <= until)
            // Ordenação determinística antes do row-limiting (Take): processa primeiro as consultas
            // mais próximas de começar; ThenBy(Id) desempata para resultado previsível (corrige o
            // aviso do EF Core: "row limiting operator without an OrderBy").
            .OrderBy(b => b.StartTime)
            .ThenBy(b => b.Id)
            .Take(50)
            .ToListAsync(cancellationToken);

        if (due.Count == 0) return;

        foreach (var b in due)
        {
            var n = new BookingNotification(
                b.Uid, b.GuestName, b.GuestEmail, b.GuestPhone,
                b.Owner.Name ?? "Profissional", b.Owner.Email,
                b.EventType.Title, b.StartTime, b.EndTime,
                b.GuestTimeZone, b.Owner.TimeZone,
                b.EventType.LocationType, b.MeetingUrl, b.EventType.RequiresConfirm);

            // WhatsApp reminder é premium (Q7): só envia se o plano do profissional permitir.
            var allowWhatsApp = await plans.UserHasFeatureAsync(b.UserId, "whatsapp_reminders", cancellationToken);
            // Marca ANTES: o Notify grava o outbox com SaveChanges, então "lembrado" e "mensagem na fila" saem na mesma transação.
            b.ReminderSent = true;
            await notify.NotifyBookingReminderAsync(n, allowWhatsApp, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[Reminder] {Count} lembrete(s) enfileirado(s).", due.Count);
    }
}
