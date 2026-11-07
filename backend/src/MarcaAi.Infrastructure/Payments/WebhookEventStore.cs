using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>Idempotência de webhooks em Postgres (tabela processed_webhook_events, PK composta).</summary>
public sealed class WebhookEventStore(ApplicationDbContext db) : IWebhookEventStore
{
    public Task<bool> WasProcessedAsync(string provider, string eventId, CancellationToken ct = default) =>
        db.ProcessedWebhookEvents.AsNoTracking().AnyAsync(e => e.Provider == provider && e.EventId == eventId, ct);

    public async Task MarkProcessedAsync(string provider, string eventId, CancellationToken ct = default)
    {
        db.ProcessedWebhookEvents.Add(new ProcessedWebhookEvent
        {
            Provider = provider,
            EventId = eventId,
            ProcessedAt = DateTime.UtcNow,
        });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Entrega simultânea do mesmo evento já gravou o registro (violação da PK): é o resultado desejado.
            db.ChangeTracker.Clear();
        }
    }
}
