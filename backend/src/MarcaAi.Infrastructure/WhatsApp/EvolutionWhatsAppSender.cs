using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.WhatsApp;

/// <summary>
/// Envio via Evolution API (não-oficial). Agnóstico: trocar por Twilio/Z-API depois é só
/// outra impl de IWhatsAppSender. Registrado quando WhatsApp:ApiUrl e ApiKey existem.
/// </summary>
public sealed class EvolutionWhatsAppSender(
    HttpClient http, IConfiguration config, ILogger<EvolutionWhatsAppSender> logger) : IWhatsAppSender
{
    public async Task SendAsync(string phone, string text, CancellationToken cancellationToken = default)
    {
        var number = NormalizePhone(phone);
        if (number is null) { logger.LogWarning("[WhatsApp] Telefone inválido (número omitido do log)"); return; }

        var apiUrl = config["WhatsApp:ApiUrl"];
        var apiKey = config["WhatsApp:ApiKey"];
        var instance = config["WhatsApp:InstanceName"] ?? "MarcaAi";
        if (string.IsNullOrWhiteSpace(apiUrl) || string.IsNullOrWhiteSpace(apiKey)) return;

        var payload = JsonSerializer.Serialize(new
        {
            number,
            options = new { delay = 1200, presence = "composing" },
            textMessage = new { text },
        });

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{apiUrl.TrimEnd('/')}/message/sendText/{instance}")
            { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
            req.Headers.Add("apikey", apiKey);
            using var res = await http.SendAsync(req, cancellationToken);
            if (!res.IsSuccessStatusCode)
                logger.LogError("[WhatsApp] Falha ({Status})", (int)res.StatusCode); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[WhatsApp] Falha — corpo da resposta: {Body}", await res.Content.ReadAsStringAsync(cancellationToken));
        }
        catch (Exception ex) { logger.LogError(ex, "[WhatsApp] Erro ao enviar mensagem"); }
    }

    /// <summary>Limpa e adiciona DDI 55 (Brasil) se ausente.</summary>
    private static string? NormalizePhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length < 10) return null;
        return digits.Length <= 11 ? $"55{digits}" : digits;
    }
}
