using System.Globalization;
using System.Net;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Notifications;
using MarcaAi.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Notifications;

/// <summary>
/// Compõe e dispara notificações de consulta por e-mail (paciente + profissional) e WhatsApp.
/// A linha de local é sensível ao tipo: online → link de acesso; presencial → endereço; telefone → aviso.
/// Cada canal é best-effort e isolado.
/// </summary>
public sealed class NotificationService(
    IEmailClient email, IWhatsAppSender whatsapp, IConfiguration config, ILogger<NotificationService> logger)
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
            await Email(n.GuestEmail, $"Solicitação de consulta recebida — {n.EventTitle}",
                Template($"Olá, {H(n.GuestName)}!",
                    $"Sua solicitação de consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} foi enviada e aguarda a confirmação do profissional.",
                    $"📅 Data sugerida: {H(whenGuest)}", null, manageUrl, "Ver detalhes"), ct);
            await Whats(n.GuestPhone,
                $"Olá, *{n.GuestName}*! ⏳\n\nSua solicitação de *{n.EventTitle}* com {n.OwnerName} foi enviada e aguarda aprovação.\n\n📅 {whenGuest}\n\nAvisaremos quando for confirmada.", ct);
        }
        else
        {
            var locLine = LocationLine(n);
            await Email(n.GuestEmail, $"Consulta confirmada — {n.EventTitle}",
                Template($"Olá, {H(n.GuestName)}!",
                    $"Sua consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} está <b>confirmada</b>.",
                    $"📅 Quando: {H(whenGuest)}", H(locLine), manageUrl, "Gerenciar consulta"), ct);
            await Whats(n.GuestPhone,
                $"Olá, *{n.GuestName}*! 👋\n\nSua consulta de *{n.EventTitle}* com {n.OwnerName} está *CONFIRMADA*.\n\n📅 {whenGuest}" +
                (locLine is null ? "" : $"\n{locLine}") +
                $"\n\nGerenciar: {manageUrl}", ct);
        }

        var whenOwner = FormatWhen(n.StartTimeUtc, n.OwnerTimeZone);
        await Email(n.OwnerEmail, $"Nova consulta — {n.EventTitle}",
            Template("Você tem uma nova consulta",
                $"<b>{H(n.GuestName)}</b> ({H(n.GuestEmail)}) agendou <b>{H(n.EventTitle)}</b>.",
                $"📅 {H(whenOwner)}", n.GuestPhone is null ? null : $"📱 {H(n.GuestPhone)}", null, null), ct);
    }

    public async Task NotifyBookingCancelledAsync(BookingNotification n, string? reason, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        await Email(n.GuestEmail, $"Consulta cancelada — {n.EventTitle}",
            Template($"Olá, {H(n.GuestName)}.",
                $"A consulta <b>{H(n.EventTitle)}</b> em {H(whenGuest)} foi <b>cancelada</b>.",
                string.IsNullOrWhiteSpace(reason) ? null : $"Motivo: {H(reason)}", null, null, null), ct);
        await Whats(n.GuestPhone,
            $"Olá, *{n.GuestName}*. ❌\n\nA consulta de *{n.EventTitle}* em {whenGuest} foi *CANCELADA*." +
            (string.IsNullOrWhiteSpace(reason) ? "" : $"\n\nMotivo: {reason}"), ct);
    }

    public async Task NotifyBookingReminderAsync(BookingNotification n, bool allowWhatsApp = true, CancellationToken ct = default)
    {
        var whenGuest = FormatWhen(n.StartTimeUtc, n.GuestTimeZone);
        var manageUrl = $"{AppUrl}/booking/{n.Uid}";
        var locLine = LocationLine(n);
        await Email(n.GuestEmail, $"Lembrete — {n.EventTitle}",
            Template($"Lembrete de consulta, {H(n.GuestName)}! ⏰",
                $"Você tem a consulta <b>{H(n.EventTitle)}</b> com {H(n.OwnerName)} em breve.",
                $"📅 {H(whenGuest)}", H(locLine), manageUrl, "Ver consulta"), ct);
        // Lembrete por WhatsApp é premium (Q7): só dispara se o plano do profissional permitir.
        if (allowWhatsApp)
            await Whats(n.GuestPhone,
                $"Lembrete! ⏰\n\nOlá, *{n.GuestName}*, você tem *{n.EventTitle}* com {n.OwnerName}.\n\n📅 {whenGuest}" +
                (locLine is null ? "" : $"\n{locLine}"), ct);
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

    private async Task Email(string to, string subject, string html, CancellationToken ct)
    {
        try { await email.SendAsync(to, subject, html, ct); }
        catch (Exception ex) { logger.LogError(ex, "[Notify] Falha ao enviar e-mail"); }
    }

    private async Task Whats(string? phone, string text, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(phone)) return;
        try { await whatsapp.SendAsync(phone, text, ct); }
        catch (Exception ex) { logger.LogError(ex, "[Notify] Falha ao enviar WhatsApp"); }
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
