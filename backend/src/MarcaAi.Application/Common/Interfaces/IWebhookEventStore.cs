namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Idempotência de webhooks (F5): registra eventos já processados com sucesso, por (provedor, id do evento).
/// Uso: <c>if (await WasProcessed) return; processa; await MarkProcessed;</c> — o registro só é gravado
/// após o sucesso, então uma falha devolve 5xx e o provedor reenvia.
/// </summary>
public interface IWebhookEventStore
{
    Task<bool> WasProcessedAsync(string provider, string eventId, CancellationToken ct = default);

    /// <summary>Marca como processado. Tolerante a corrida (duas entregas simultâneas).</summary>
    Task MarkProcessedAsync(string provider, string eventId, CancellationToken ct = default);
}
