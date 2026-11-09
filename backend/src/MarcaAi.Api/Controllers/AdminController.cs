using MarcaAi.Api.Auth;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Painel do dono: visão agregada de cadastros, consultas, receita e erros recentes. Só para os ids em <c>Admin:UserIds</c>
/// (ou <c>Admin:HangfireUserIds</c>); para qualquer outro usuário responde 404 (não revela que a rota existe).
/// Dados agregados — não lista pacientes nem dados de saúde.
/// </summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize]
public sealed class AdminController(ApplicationDbContext db, IConfiguration config) : ControllerBase
{
    private bool IsAdmin()
    {
        var id = User.GetUserId();
        if (id is null) return false;
        var raw = (config["Admin:UserIds"] ?? "") + "," + (config["Admin:HangfireUserIds"] ?? "");
        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Contains(id);
    }

    /// <summary>Recoloca na fila uma mensagem morta (o conteúdo foi guardado justamente para isso). Tentativas voltam a zero.</summary>
    [HttpPost("outbox/{id}/requeue")]
    public async Task<IActionResult> Requeue(string id, CancellationToken ct)
    {
        if (!IsAdmin()) return NotFound();
        var n = await db.OutboxMessages.Where(o => o.Id == id && o.Status == OutboxStatus.DEAD)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OutboxStatus.PENDING).SetProperty(o => o.Attempts, 0)
                .SetProperty(o => o.NextAttemptAt, DateTime.UtcNow).SetProperty(o => o.ProcessedAt, (DateTime?)null), ct);
        return n == 0 ? NotFound() : NoContent();
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken ct)
    {
        if (!IsAdmin()) return NotFound();
        var now = DateTime.UtcNow;
        var d7 = now.AddDays(-7);
        var d1 = now.AddDays(-1);

        var users = await db.Users.AsNoTracking().CountAsync(ct);
        var onboarded = await db.Users.AsNoTracking().CountAsync(u => u.Onboarded, ct);
        var newUsers7d = await db.Users.AsNoTracking().CountAsync(u => u.CreatedAt >= d7, ct);

        var byStatus = await db.Bookings.AsNoTracking().GroupBy(b => b.Status).Select(g => new { Status = g.Key.ToString(), N = g.Count() }).ToListAsync(ct);
        var bookings7d = await db.Bookings.AsNoTracking().CountAsync(b => b.CreatedAt >= d7, ct);
        var upcoming = await db.Bookings.AsNoTracking().CountAsync(b => b.StartTime > now && b.Status == BookingStatus.CONFIRMED, ct);
        var paid = await db.Bookings.AsNoTracking().Where(b => b.PaymentStatus == PaymentStatus.PAID)
            .GroupBy(_ => 1).Select(g => new { N = g.Count(), Cents = g.Sum(x => (long)(x.PriceCents ?? 0)), Fee = g.Sum(x => (long)(x.PlatformFeeCents ?? 0)) }).FirstOrDefaultAsync(ct);
        var pendingPayment = await db.Bookings.AsNoTracking().CountAsync(b => b.Status == BookingStatus.PENDING && b.PaymentDueAt != null && b.PaymentStatus != PaymentStatus.PAID, ct);

        // Ativação: quem concluiu o onboarding e já recebeu ao menos uma consulta.
        var activated = await db.Users.AsNoTracking().CountAsync(u => u.Onboarded && u.BookingsAsOwner.Any(), ct);

        var errors24h = await db.ErrorEvents.AsNoTracking().CountAsync(e => e.CreatedAt >= d1, ct);
        var recent = await db.ErrorEvents.AsNoTracking().OrderByDescending(e => e.CreatedAt).Take(30)
            .Select(e => new { e.Source, e.Message, e.Path, e.Status, e.CreatedAt }).ToListAsync(ct);

        // Fila de notificações (outbox): sem destinatário nem conteúdo — só tipo, tentativas e o erro já mascarado.
        var pendingOutbox = await db.OutboxMessages.AsNoTracking().Where(o => o.Status == OutboxStatus.PENDING).ToListAsync(ct);
        var deadOutbox = await db.OutboxMessages.AsNoTracking().Where(o => o.Status == OutboxStatus.DEAD)
            .OrderByDescending(o => o.ProcessedAt).Take(30)
            .Select(o => new { o.Id, o.Kind, o.Channel, o.Attempts, o.LastError, o.CreatedAt }).ToListAsync(ct);
        var deadCount = await db.OutboxMessages.AsNoTracking().CountAsync(o => o.Status == OutboxStatus.DEAD, ct);
        var oldestPendingMinutes = pendingOutbox.Count == 0 ? 0 : (int)(now - pendingOutbox.Min(o => o.CreatedAt)).TotalMinutes;

        return Ok(new
        {
            generatedAt = now,
            outbox = new
            {
                pending = pendingOutbox.Count, retrying = pendingOutbox.Count(o => o.Attempts > 0), dead = deadCount,
                oldestPendingMinutes, deadRecent = deadOutbox,
            },
            users = new { total = users, onboarded, newLast7Days = newUsers7d, activated },
            bookings = new { byStatus, createdLast7Days = bookings7d, upcomingConfirmed = upcoming, pendingPayment },
            payments = new { paidCount = paid?.N ?? 0, grossCents = paid?.Cents ?? 0, platformFeeCents = paid?.Fee ?? 0 },
            errors = new { last24h = errors24h, recent },
        });
    }
}
