using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Payments;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>PIX via API do Mercado Pago (HTTP direto). Sem token configurado, retorna null.</summary>
public sealed class MercadoPagoPixService(
    HttpClient http, IConfiguration config, ILogger<MercadoPagoPixService> logger) : IPixPaymentService
{
    private const string Api = "https://api.mercadopago.com/v1/payments";

    public async Task<PixCharge?> CreateAsync(
        decimal amountReais, string description, string payerEmail, string payerFirstName,
        string externalReference, CancellationToken ct = default)
    {
        var token = config["MercadoPago:AccessToken"];
        if (string.IsNullOrWhiteSpace(token)) return null;

        var payload = JsonSerializer.Serialize(new
        {
            transaction_amount = amountReais,
            description,
            payment_method_id = "pix",
            payer = new { email = payerEmail, first_name = payerFirstName },
            external_reference = externalReference,
            notification_url = config["MercadoPago:NotificationUrl"],
        });

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, Api)
            { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // Idempotência: evita cobrança duplicada em retries.
            req.Headers.Add("X-Idempotency-Key", externalReference);

            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[MercadoPago] Criar PIX falhou ({Status})", (int)res.StatusCode); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[MercadoPago] Criar PIX falhou — corpo da resposta: {Body}", body);
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var id = root.GetProperty("id").GetRawText().Trim('"');

            string? qrB64 = null, qr = null, ticket = null;
            if (root.TryGetProperty("point_of_interaction", out var poi) &&
                poi.TryGetProperty("transaction_data", out var td))
            {
                if (td.TryGetProperty("qr_code_base64", out var a)) qrB64 = a.GetString();
                if (td.TryGetProperty("qr_code", out var b)) qr = b.GetString();
                if (td.TryGetProperty("ticket_url", out var c)) ticket = c.GetString();
            }
            return new PixCharge(id, qrB64, qr, ticket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[MercadoPago] Erro ao criar PIX");
            return null;
        }
    }

    public async Task<PaymentStatusInfo?> GetPaymentAsync(string paymentId, CancellationToken ct = default)
    {
        var token = config["MercadoPago:AccessToken"];
        if (string.IsNullOrWhiteSpace(token)) return null;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{Api}/{paymentId}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            var status = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
            var extRef = root.TryGetProperty("external_reference", out var er) ? er.GetString() : null;
            return new PaymentStatusInfo(status, extRef);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[MercadoPago] Erro ao consultar pagamento");
            return null;
        }
    }
}
