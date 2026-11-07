using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Jobs;

/// <summary>
/// Retenção e higiene (D10 = 24 meses, provisório até revisão jurídica). Diário:
///  1. anonimiza consultas encerradas há mais de <c>Privacy:RetentionMonths</c> (0 = desliga), mantendo só o registro
///     financeiro (valores, datas, status) — Art. 16, I;
///  2. apaga tokens de verificação expirados e registros antigos de idempotência de webhooks;
///  3. cifra tokens OAuth do Google que ainda estejam em texto puro (G09).
/// </summary>
public sealed class RetentionJob(
    ApplicationDbContext db, IOAuthTokenProtector tokens, IConfiguration config, ILogger<RetentionJob> logger) : IRetentionJob
{
    public async Task RunAsync(CancellationToken ct = default)
    {
        var months = int.TryParse(config["Privacy:RetentionMonths"], out var m) ? m : 24;
        if (months > 0)
        {
            var cutoff = DateTime.UtcNow.AddMonths(-months);
            var batch = await db.Bookings.Include(b => b.Responses)
                .Where(b => b.EndTime < cutoff && !b.GuestEmail.EndsWith("@anonimizado.invalid"))
                .Take(500).ToListAsync(ct);
            foreach (var b in batch)
            {
                b.GuestName = "Paciente anonimizado";
                b.GuestEmail = $"anonimizado+{b.Id}@anonimizado.invalid";
                b.GuestPhone = null;
                b.GuestNotes = null;
                db.BookingResponses.RemoveRange(b.Responses);
            }
            if (batch.Count > 0) await db.SaveChangesAsync(ct);
            logger.LogInformation("[Retention] {Count} consulta(s) anonimizada(s) (prazo {Months} meses).", batch.Count, months);
        }

        var tokensGone = await db.VerificationTokens.Where(v => v.Expires < DateTime.UtcNow.AddDays(-1)).ExecuteDeleteAsync(ct);
        var eventsGone = await db.ProcessedWebhookEvents.Where(e => e.ProcessedAt < DateTime.UtcNow.AddDays(-90)).ExecuteDeleteAsync(ct);

        var legacy = await db.Accounts
            .Where(a => (a.AccessToken != null && !a.AccessToken.StartsWith("enc:")) || (a.RefreshToken != null && !a.RefreshToken.StartsWith("enc:")))
            .ToListAsync(ct);
        foreach (var a in legacy)
        {
            a.AccessToken = tokens.Protect(a.AccessToken);
            a.RefreshToken = tokens.Protect(a.RefreshToken);
        }
        if (legacy.Count > 0) await db.SaveChangesAsync(ct);

        logger.LogInformation("[Retention] tokens de login removidos={Tokens} eventos de webhook removidos={Events} contas OAuth cifradas={Accounts}",
            tokensGone, eventsGone, legacy.Count);
    }
}
