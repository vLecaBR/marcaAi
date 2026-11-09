using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Email;

/// <summary>Envia e-mail via API do Resend. Registrado quando Resend:ApiKey está presente.</summary>
public sealed class ResendEmailClient(
    HttpClient http, IConfiguration config, ILogger<ResendEmailClient> logger) : IEmailClient
{
    public async Task SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        var apiKey = config["Resend:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey)) { logger.LogWarning("[Resend] ApiKey ausente."); return; }
        var from = config["Resend:FromEmail"] ?? "MarcaAí <onboarding@resend.dev>";

        var payload = JsonSerializer.Serialize(new { from, to = new[] { to }, subject, html });
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
            { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var res = await http.SendAsync(req, cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[Resend] Falha ({Status})", (int)res.StatusCode);
                if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[Resend] Falha — corpo da resposta: {Body}", await res.Content.ReadAsStringAsync(cancellationToken));
                // Só o status (o corpo pode citar o destinatário). O outbox decide se repete.
                throw new HttpRequestException($"Resend respondeu {(int)res.StatusCode}", null, res.StatusCode);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError("[Resend] Erro ao enviar e-mail ({Type})", ex.GetType().Name); throw; }
    }
}
