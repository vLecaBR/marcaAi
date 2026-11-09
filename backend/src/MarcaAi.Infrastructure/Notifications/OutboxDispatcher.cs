using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Observability;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Notifications;

/// <summary>
/// Entrega as mensagens do outbox. Duas portas de entrada: o caminho rápido (<see cref="DispatchAsync"/> com os ids recém-gravados,
/// chamado pelo NotificationService) e o job recorrente (<see cref="RunAsync"/>, que pega as vencidas). Ambos "reivindicam" as
/// linhas com um aluguel (<c>nextAttemptAt</c> = agora + <c>Outbox:LeaseMinutes</c>, via <c>FOR UPDATE SKIP LOCKED</c>),
/// então duas execuções simultâneas nunca enviam a mesma mensagem; se o processo morrer no meio, o aluguel expira e outra tenta.
/// Semântica: pelo-menos-uma-vez (uma queda entre o envio e a gravação pode repetir um e-mail; nunca perde).
/// </summary>
public sealed class OutboxDispatcher(
    ApplicationDbContext db, IEmailClient email, IWhatsAppSender whatsapp, IConfiguration config, ILogger<OutboxDispatcher> logger)
    : IOutboxDrainJob
{
    /// <summary>Espera antes da 2ª, 3ª… tentativa (a 1ª é imediata, no caminho rápido).</summary>
    public static readonly TimeSpan[] Backoff =
        [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15), TimeSpan.FromHours(1), TimeSpan.FromHours(3), TimeSpan.FromHours(6), TimeSpan.FromHours(12)];

    private const int Batch = 50;
    private int MaxAttempts => Math.Max(1, config.GetValue("Outbox:MaxAttempts", 8));
    private int LeaseMinutes => Math.Max(1, config.GetValue("Outbox:LeaseMinutes", 5));

    public Task RunAsync(CancellationToken ct = default) => DispatchAsync(null, ct);

    /// <param name="ids">Só estes ids (caminho rápido); <c>null</c> = as vencidas de qualquer um (job).</param>
    public async Task DispatchAsync(IReadOnlyCollection<string>? ids, CancellationToken ct = default)
    {
        var claimed = await ClaimAsync(ids?.ToArray(), ct);
        if (claimed.Count == 0) return;

        var messages = await db.OutboxMessages.Where(m => claimed.Contains(m.Id)).OrderBy(m => m.CreatedAt).ToListAsync(ct);
        // Descarta o que ficou sem sentido (consulta cancelada antes do envio, lembrete de consulta que já passou).
        var uids = messages.Where(m => m.BookingUid != null).Select(m => m.BookingUid!).Distinct().ToList();
        var bookings = uids.Count == 0
            ? new Dictionary<string, (BookingStatus Status, DateTime Start)>()
            : (await db.Bookings.AsNoTracking().Where(b => uids.Contains(b.Uid)).Select(b => new { b.Uid, b.Status, b.StartTime }).ToListAsync(ct))
                .ToDictionary(b => b.Uid, b => (b.Status, b.StartTime));

        int sent = 0, retry = 0, dead = 0, skipped = 0;
        foreach (var m in messages)
        {
            var now = DateTime.UtcNow;
            if (m.BookingUid is not null && bookings.TryGetValue(m.BookingUid, out var b) && IsStale(m.Kind, b.Status, b.Item2, now))
            {
                Finish(m, OutboxStatus.SKIPPED, now); skipped++;
                await db.SaveChangesAsync(ct);
                continue;
            }

            try
            {
                if (m.Channel == "EMAIL") await email.SendAsync(m.Recipient, m.Subject, m.Body, ct);
                else await whatsapp.SendAsync(m.Recipient, m.Body, ct);
                Finish(m, OutboxStatus.SENT, now); sent++;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // desligamento: o aluguel expira e outra execução entrega
            }
            catch (Exception ex)
            {
                m.Attempts++;
                m.LastError = ErrorRecorder.Scrub($"{ex.GetType().Name}: {SafeException.Message(ex)}", 300);
                if (m.Attempts >= MaxAttempts) { m.Status = OutboxStatus.DEAD; m.ProcessedAt = now; dead++; }
                else { m.NextAttemptAt = now + Backoff[Math.Min(m.Attempts - 1, Backoff.Length - 1)]; retry++; }
            }
            await db.SaveChangesAsync(ct);
        }

        if (dead > 0) logger.LogError("[Outbox] {Dead} mensagem(ns) esgotaram as tentativas (veja o /admin).", dead);
        else logger.LogInformation("[Outbox] enviadas={Sent} a-repetir={Retry} descartadas={Skipped}", sent, retry, skipped);
    }

    /// <summary>Mensagem que não deve mais sair: tudo que fala de uma consulta cancelada (menos o próprio aviso de cancelamento) e lembrete vencido.</summary>
    public static bool IsStale(string kind, BookingStatus status, DateTime startUtc, DateTime now)
    {
        if (kind == "booking.cancelled") return false;
        if (status == BookingStatus.CANCELLED) return true;
        return kind == "booking.reminder" && startUtc < now;
    }

    private static void Finish(OutboxMessage m, OutboxStatus status, DateTime now)
    {
        m.Status = status;
        m.ProcessedAt = now;
        m.LastError = null;
        // LGPD: depois de enviada/descartada, a linha vira só metadado.
        m.Recipient = ""; m.Subject = ""; m.Body = "";
    }

    private async Task<List<string>> ClaimAsync(string[]? ids, CancellationToken ct)
    {
        var lease = LeaseMinutes;
        // FOR UPDATE SKIP LOCKED na subconsulta + UPDATE ... RETURNING: reivindica sem segurar transação aberta durante o envio.
        return ids is null
            ? await db.Database.SqlQuery<string>($"""
                UPDATE outbox_messages SET "nextAttemptAt" = now() + make_interval(mins => {lease})
                WHERE id IN (SELECT id FROM outbox_messages WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
                             ORDER BY "nextAttemptAt" LIMIT {Batch} FOR UPDATE SKIP LOCKED)
                RETURNING id AS "Value"
                """).ToListAsync(ct)
            : await db.Database.SqlQuery<string>($"""
                UPDATE outbox_messages SET "nextAttemptAt" = now() + make_interval(mins => {lease})
                WHERE id IN (SELECT id FROM outbox_messages WHERE status = 'PENDING' AND "nextAttemptAt" <= now() AND id = ANY({ids})
                             FOR UPDATE SKIP LOCKED)
                RETURNING id AS "Value"
                """).ToListAsync(ct);
    }
}
