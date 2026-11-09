namespace MarcaAi.Domain.Entities;

public enum OutboxStatus { PENDING, SENT, DEAD, SKIPPED }

/// <summary>
/// Mensagem de notificação (e-mail ou WhatsApp) já composta, esperando entrega. Gravada ao notificar; um dispatcher entrega
/// e, se falhar, repete com espera crescente até <c>Outbox:MaxAttempts</c> (então vira DEAD, visível no /admin).
/// LGPD: o conteúdo (nome, data, serviço) só existe enquanto a entrega está pendente/morta; ao enviar ou descartar,
/// destinatário, assunto e corpo são apagados e a linha vira só metadado. Retenção: SENT/SKIPPED 7 dias, DEAD 30 dias.
/// Tabela "outbox_messages".
/// </summary>
public class OutboxMessage
{
    public string Id { get; set; } = default!;
    /// <summary>"EMAIL" ou "WHATSAPP".</summary>
    public string Channel { get; set; } = "EMAIL";
    /// <summary>Tipo do evento: booking.created, booking.pending_payment, booking.rescheduled, booking.cancelled, booking.reminder, booking.owner_*.</summary>
    public string Kind { get; set; } = default!;
    /// <summary>Consulta a que a mensagem se refere (para descartar se ela foi cancelada antes do envio).</summary>
    public string? BookingUid { get; set; }
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public OutboxStatus Status { get; set; } = OutboxStatus.PENDING;
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; }
    /// <summary>Último erro, sem dado pessoal (tipo e texto-base, e-mails mascarados).</summary>
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ProcessedAt { get; set; }
}
