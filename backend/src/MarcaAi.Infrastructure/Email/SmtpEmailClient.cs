using System.Net.Mail;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Email;

/// <summary>
/// E-mail por SMTP simples (sem autenticação/TLS) — para o Mailpit do docker-compose em desenvolvimento
/// (<c>Smtp:Host=localhost</c>, <c>Smtp:Port=1025</c>). Em produção use o Resend.
/// </summary>
public sealed class SmtpEmailClient(IConfiguration config, ILogger<SmtpEmailClient> logger) : IEmailClient
{
    public async Task SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        try
        {
            using var client = new SmtpClient(config["Smtp:Host"], int.TryParse(config["Smtp:Port"], out var p) ? p : 1025);
            using var msg = new MailMessage
            {
                From = new MailAddress(config["Smtp:From"] ?? "nao-responda@marcaai.local", "MarcaAí"),
                Subject = subject,
                Body = html,
                IsBodyHtml = true,
            };
            msg.To.Add(to);
            await client.SendMailAsync(msg, cancellationToken);
        }
        catch (Exception ex) { logger.LogError(ex, "[SMTP] Erro ao enviar e-mail"); }
    }
}

public sealed class SmtpMagicLinkSender(IEmailClient email) : IMagicLinkSender
{
    public Task SendAsync(string toEmail, string magicLinkUrl, CancellationToken cancellationToken = default) =>
        email.SendAsync(toEmail, MagicLinkEmail.Subject, MagicLinkEmail.Html(magicLinkUrl), cancellationToken);
}
