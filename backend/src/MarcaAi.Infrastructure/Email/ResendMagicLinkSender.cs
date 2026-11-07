using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Email;

/// <summary>
/// Envia o magic link por e-mail via API do Resend (https://resend.com).
/// Registrado apenas quando Resend:ApiKey está configurado (ver DependencyInjection).
/// </summary>
public sealed class ResendMagicLinkSender(
    HttpClient http, IConfiguration config, ILogger<ResendMagicLinkSender> logger) : IMagicLinkSender
{
    private const string ResendApi = "https://api.resend.com/emails";

    public async Task SendAsync(string email, string magicLinkUrl, CancellationToken cancellationToken = default)
    {
        var apiKey = config["Resend:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogWarning("[Resend] Resend:ApiKey ausente — e-mail não enviado.");
            return;
        }

        var from = config["Resend:FromEmail"] ?? "MarcaAí <onboarding@resend.dev>";
        var html = MagicLinkEmail.Html(magicLinkUrl);

        var payload = JsonSerializer.Serialize(new
        {
            from,
            to = new[] { email },
            subject = MagicLinkEmail.Subject,
            html,
        });

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, ResendApi)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var res = await http.SendAsync(req, cancellationToken);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[Resend] Falha ao enviar ({Status})", (int)res.StatusCode);
                if (logger.IsEnabled(LogLevel.Debug))
                    logger.LogDebug("[Resend] Falha — corpo da resposta: {Body}", await res.Content.ReadAsStringAsync(cancellationToken));
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[Resend] Erro ao enviar e-mail");
        }
    }
}
