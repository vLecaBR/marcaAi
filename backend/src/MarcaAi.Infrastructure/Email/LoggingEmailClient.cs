using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Email;

/// <summary>
/// Fallback quando o Resend não está configurado: não envia. Destinatário e assunto só em Debug;
/// em Information registra apenas o fato.
/// </summary>
public sealed class LoggingEmailClient(ILogger<LoggingEmailClient> logger) : IEmailClient
{
    public Task SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[E-mail simulado] e-mail de {Len} caracteres não enviado (Resend não configurado).", html.Length);
        logger.LogDebug("[E-mail simulado] para {To}: {Subject}", to, subject);
        return Task.CompletedTask;
    }
}
