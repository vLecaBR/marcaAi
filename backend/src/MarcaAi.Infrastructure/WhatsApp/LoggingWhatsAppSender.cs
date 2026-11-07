using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.WhatsApp;

/// <summary>
/// Fallback quando a Evolution API não está configurada: não envia. Destinatário e texto
/// (dado de saúde) só aparecem em nível Debug; em Information registra apenas o fato.
/// </summary>
public sealed class LoggingWhatsAppSender(ILogger<LoggingWhatsAppSender> logger) : IWhatsAppSender
{
    public Task SendAsync(string phone, string text, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[WhatsApp simulado] mensagem de {Len} caracteres não enviada (Evolution API não configurada).", text.Length);
        logger.LogDebug("[WhatsApp simulado] para {Phone}: {Text}", phone, text);
        return Task.CompletedTask;
    }
}
