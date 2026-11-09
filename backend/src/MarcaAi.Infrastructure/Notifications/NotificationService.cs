using System.Globalization;
using System.Net;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Notifications;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Notifications;

/// <summary>
/// Compõe e dispara notificações de consulta por e-mail (paciente + profissional) e WhatsApp.
/// A linha de local é sensível ao tipo: online → link de acesso; presencial → endereço; telefone → aviso.
/// As mensagens vão para o outbox (<see cref="OutboxMessage"/>) e são entregues na hora; se falharem, o job as repete.
/// </summary>
public sealed class NotificationService(
    ApplicationDbContext db, OutboxDispatcher dispatcher, IConfiguration config, ILogger<NotificationService> logger)
    : INotificationService
{
    private static readonly CultureInfo Br = new("pt-BR");

    /// <summary>Escapa HTML: nome, título, motivo e observações vêm de terceiros (anti-injeção de HTML/phishing por e-mail).</summary>
    private static string H(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);
    private string AppUrl => (config["App:PublicUrl"] ?? "http://localhost:3000").TrimEnd('/');

    public async Task NotifyBookingCreatedAsync(BookingNotification n, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        var manageUrl = $"{AppUrl}/booking/{n.Uid}";

        if (n.RequiresConfirm)
        {
            await Email("booking.created", n.Uid, n.GuestEmail, $"Solicitação de consulta recebida — {n.EventTitle}",
                Template($"Olá, {H(n.GuestName)}!",
                    $"Sua solicitação de consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} foi enviada e aguarda a confirmação do profissional.",
                    $"📅 Data sugerida: {H(whenGuest)}", null, manageUrl, "Ver detalhes"), ct);
            await Whats("booking.created", n.Uid, n.GuestPhone,
                $"Olá, *{n.GuestName}*! ⏳\n\nSua solicitação de *{n.EventTitle}* com {n.OwnerName} foi enviada e aguarda aprovação.\n\n📅 {whenGuest}\n\nAvisaremos quando for confirmada.", ct);
        }
        else
        {
            var locLine = LocationLine(n);
            await Email("booking.created", n.Uid, n.GuestEmail, $"Consulta confirmada — {n.EventTitle}",
                Template($"Olá, {H(n.GuestName)}!",
                    $"Sua consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} está <b>confirmada</b>.",
                    $"📅 Quando: {H(whenGuest)}", H(locLine), manageUrl, "Gerenciar consulta"), ct);
            await Whats("booking.created", n.Uid, n.GuestPhone,
                $"Olá, *{n.GuestName}*! 👋\n\nSua consulta de *{n.EventTitle}* com {n.OwnerName} está *CONFIRMADA*.\n\n📅 {whenGuest}" +
                (locLine is null ? "" : $"\n{locLine}") +
                $"\n\nGerenciar: {manageUrl}", ct);
        }

        var whenOwner = FormatWhen(n.StartTimeUtc, n.OwnerTimeZone);
        await Email("owner_created", n.Uid, n.OwnerEmail, $"Nova consulta — {n.EventTitle}",
            Template("Você tem uma nova consulta",
                $"<b>{H(n.GuestName)}</b> ({H(n.GuestEmail)}) agendou <b>{H(n.EventTitle)}</b>.",
                $"📅 {H(whenOwner)}", n.GuestPhone is null ? null : $"📱 {H(n.GuestPhone)}", null, null), ct);
    
        await FlushAsync(ct);
    }

    public async Task NotifyBookingPendingPaymentAsync(BookingNotification n, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        var payUrl = $"{AppUrl}/booking/{n.Uid}/pay";
        var price = n.PriceCents is { } c ? (c / 100m).ToString("C", Br) : null;
        var due = n.PaymentDueAtUtc is { } d ? FormatWhen(d, n.GuestTimeZone) : null;
        var dueShort = n.PaymentDueAtUtc is { } d2 ? ShortTime(d2, n.GuestTimeZone) : null;

        await Email("booking.pending_payment", n.Uid, n.GuestEmail, $"Reserva aguardando pagamento — {n.EventTitle}",
            Template($"Olá, {H(n.GuestName)}!",
                $"Reservamos o horário da consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)}. Para <b>confirmar</b>, conclua o pagamento" +
                (price is null ? "" : $" de <b>{H(price)}</b>") + (dueShort is null ? "" : $" até <b>{H(dueShort)}</b>") +
                ". Sem o pagamento a reserva é cancelada e o horário é liberado.",
                $"📅 Quando: {H(whenGuest)}", due is null ? null : $"⏳ Pague até: {H(due)}", payUrl, "Pagar e confirmar"), ct);
        await Whats("booking.pending_payment", n.Uid, n.GuestPhone,
            $"Olá, *{n.GuestName}*! ⏳\n\nSeu horário de *{n.EventTitle}* com {n.OwnerName} está *reservado*" +
            (dueShort is null ? "" : $" até {dueShort}") + $". Pague para confirmar: {payUrl}\n\n📅 {whenGuest}", ct);
    
        await FlushAsync(ct);
    }

    public async Task NotifyBookingRescheduledAsync(BookingNotification n, DateTime oldStartUtc, CancellationToken ct = default)
    {
        var oldGuest = FormatWhen(oldStartUtc, n.GuestTimeZone);
        var newGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        var manageUrl = $"{AppUrl}/booking/{n.Uid}";
        var locLine = LocationLine(n);
        await Email("booking.rescheduled", n.Uid, n.GuestEmail, $"Consulta remarcada — {n.EventTitle}",
            Template($"Olá, {H(n.GuestName)}!",
                $"Sua consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} foi <b>remarcada</b>.",
                $"📅 Novo horário: {H(newGuest)} (antes: {H(oldGuest)})", H(locLine), manageUrl, "Gerenciar consulta"), ct);
        await Whats("booking.rescheduled", n.Uid, n.GuestPhone,
            $"Olá, *{n.GuestName}*! 🔁\n\nSua consulta de *{n.EventTitle}* foi *REMARCADA*.\n\n📅 Novo horário: {newGuest}\n(antes: {oldGuest})" +
            (locLine is null ? "" : $"\n{locLine}") + $"\n\nGerenciar: {manageUrl}", ct);

        var newOwner = FormatWhen(n.StartTimeUtc, n.OwnerTimeZone);
        var oldOwner = FormatWhen(oldStartUtc, n.OwnerTimeZone);
        await Email("owner_rescheduled", n.Uid, n.OwnerEmail, $"Consulta remarcada — {n.EventTitle}",
            Template("Uma consulta foi remarcada",
                $"<b>{H(n.GuestName)}</b> ({H(n.GuestEmail)}) — <b>{H(n.EventTitle)}</b>.",
                $"📅 Novo horário: {H(newOwner)} (antes: {H(oldOwner)})", null, null, null), ct);
    
        await FlushAsync(ct);
    }

    private static string ShortTime(DateTime utc, string tzId)
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(tzId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz).ToString("HH:mm", Br);
        }
        catch { return utc.ToString("HH:mm 'UTC'", Br); }
    }

    public async Task NotifyBookingCancelledAsync(BookingNotification n, string? reason, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        await Email("booking.cancelled", n.Uid, n.GuestEmail, $"Consulta cancelada — {n.EventTitle}",
            Template($"Olá, {H(n.GuestName)}.",
                $"A consulta <b>{H(n.EventTitle)}</b> em {H(whenGuest)} foi <b>cancelada</b>.",
                string.IsNullOrWhiteSpace(reason) ? null : $"Motivo: {H(reason)}", null, null, null), ct);
        await Whats("booking.cancelled", n.Uid, n.GuestPhone,
            $"Olá, *{n.GuestName}*. ❌\n\nA consulta de *{n.EventTitle}* em {whenGuest} foi *CANCELADA*." +
            (string.IsNullOrWhiteSpace(reason) ? "" : $"\n\nMotivo: {reason}"), ct);
    
        await FlushAsync(ct);
    }

    public async Task NotifyBookingReminderAsync(BookingNotification n, bool allowWhatsApp = true, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        var manageUrl = $"{AppUrl}/booking/{n.Uid}";
        var locLine = LocationLine(n);
        await Email("booking.reminder", n.Uid, n.GuestEmail, $"Lembrete — {n.EventTitle}",
            Template($"Lembrete de consulta, {H(n.GuestName)}! ⏰",
                $"Você tem a consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} em breve.",
                $"📅 {H(whenGuest)}", H(locLine), manageUrl, "Ver consulta"), ct);
        // Lembrete por WhatsApp é premium (Q7): só dispara se o plano do profissional permitir.
        if (allowWhatsApp)
            await Whats("booking.reminder", n.Uid, n.GuestPhone,
                $"Lembrete! ⏰\n\nOlá, *{n.GuestName}*, você tem *{n.EventTitle}* com {n.OwnerName}.\n\n📅 {whenGuest}" +
                (locLine is null ? "" : $"\n{locLine}"), ct);
    
        await FlushAsync(ct);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// <summary>Linha de local sensível ao tipo: online → acesso; presencial → endereço; telefone → aviso.</summary>
    private static string? LocationLine(BookingNotification n) => n.LocationType switch
    {
        LocationType.IN_PERSON =>
            string.IsNullOrWhiteSpace(n.LocationDetail) ? "📍 Consulta presencial" : $"📍 Endereço: {n.LocationDetail}",
        LocationType.PHONE =>
            "📞 A consulta será por telefone — aguarde o contato.",
        // GOOGLE_MEET, ZOOM, TEAMS, CUSTOM → link de acesso online
        _ => string.IsNullOrWhiteSpace(n.LocationDetail) ? null : $"🔗 Acesso: {n.LocationDetail}",
    };

    /// <summary>Mensagens compostas nesta chamada (ainda não gravadas).</summary>
    private readonly List<OutboxMessage> _batch = [];

    private Task Email(string kind, string uid, string to, string subject, string html, CancellationToken ct)
    {
        _batch.Add(new OutboxMessage { Channel = "EMAIL", Kind = kind, BookingUid = uid, Recipient = to, Subject = subject, Body = html });
        return Task.CompletedTask;
    }

    private Task Whats(string kind, string uid, string? phone, string text, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(phone)) return Task.CompletedTask;
        _batch.Add(new OutboxMessage { Channel = "WHATSAPP", Kind = kind, BookingUid = uid, Recipient = phone, Body = text });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Grava as mensagens no outbox (na mesma gravação de qualquer alteração pendente do contexto — o ReminderJob marca
    /// <c>ReminderSent</c> antes, então os dois são atômicos) e tenta entregá-las já. Se a entrega falhar, o job repete.
    /// </summary>
    private async Task FlushAsync(CancellationToken ct)
    {
        if (_batch.Count == 0) return;
        var now = DateTime.UtcNow;
        foreach (var m in _batch) { m.Status = OutboxStatus.PENDING; m.NextAttemptAt = now; m.CreatedAt = now; db.OutboxMessages.Add(m); }
        await db.SaveChangesAsync(ct);
        var ids = _batch.Select(m => m.Id).ToList();
        _batch.Clear();
        try { await dispatcher.DispatchAsync(ids, ct); }
        catch (Exception ex) { logger.LogWarning("[Outbox] Entrega imediata falhou ({Type}); o job repete.", ex.GetType().Name); }
    }

    private static string FormatWhen(DateTime utc, string tzId)
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(tzId);
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), tz);
            return local.ToString("dddd, dd/MM/yyyy 'às' HH:mm", Br);
        }
        catch { return utc.ToString("dd/MM/yyyy HH:mm 'UTC'", Br); }
    }

    private static string Template(string title, string body, string? line1, string? line2, string? url, string? cta)
    {
        var extra = string.Concat(
            string.IsNullOrEmpty(line1) ? "" : $"<p style=\"margin:4px 0;color:#334155\">{line1}</p>",
            string.IsNullOrEmpty(line2) ? "" : $"<p style=\"margin:4px 0;color:#334155\">{line2}</p>");
        var button = url is null || cta is null ? "" :
            $"<p style=\"margin:24px 0\"><a href=\"{url}\" style=\"background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block\">{cta}</a></p>";
        return $"""
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
              <h2 style="margin:0 0 8px">{title}</h2>
              <p style="color:#475569">{body}</p>
              {extra}
              {button}
              <p style="color:#94a3b8;font-size:12px;margin-top:24px">MarcaAí · agendamento para profissionais da saúde</p>
            </div>
            """;
    }
}
