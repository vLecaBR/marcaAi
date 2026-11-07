namespace MarcaAi.Domain.Entities;

/// <summary>
/// Registro de eventos de webhook já processados com sucesso, para idempotência (F5).
/// Chave composta (Provider, EventId): um mesmo evento reenviado pelo provedor é ignorado.
/// Tabela "processed_webhook_events".
/// </summary>
public class ProcessedWebhookEvent
{
    /// <summary>"stripe" | "mercadopago".</summary>
    public string Provider { get; set; } = default!;

    /// <summary>Id do evento no provedor (Stripe: evt_...; MP: x-request-id).</summary>
    public string EventId { get; set; } = default!;

    public DateTime ProcessedAt { get; set; }
}
