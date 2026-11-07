using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Payments;
using MarcaAi.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>
/// Split de PIX via Mercado Pago (marketplace): cria o pagamento na conta do vendedor (sub-conta)
/// com <c>application_fee</c> = comissão do MarcaAí, repassando o líquido ao profissional/clínica.
/// Espelha o <see cref="StripeConnectService"/>, mas para PIX. Tokens lidos de configuração/secret store —
/// nunca hard-coded. Ver financial-split-spec.md §3.2/§6.2.
/// </summary>
public sealed class MercadoPagoSplitService(
    HttpClient http, IConfiguration config, ILogger<MercadoPagoSplitService> logger) : ISplitPaymentService
{
    private const string Api = "https://api.mercadopago.com/v1/payments";

    public PaymentProvider Provider => PaymentProvider.MERCADO_PAGO;

    public async Task<SplitChargeResult?> CreateChargeAsync(SplitChargeRequest request, CancellationToken ct = default)
    {
        // Token do VENDEDOR (obtido via OAuth no onboarding, §6.1) — resolvido do secret store por
        // conta conectada. Fallback: token do marketplace. Sem token → provedor não configurado.
        var token = ResolveSellerAccessToken(request.DestinationAccountId);
        if (string.IsNullOrWhiteSpace(token))
        {
            logger.LogWarning("[MPSplit] AccessToken ausente p/ conta {Account} — cobrança ignorada.",
                request.DestinationAccountId);
            return null;
        }

        var payload = JsonSerializer.Serialize(new
        {
            transaction_amount = request.GrossCents / 100m,
            description = request.Description,
            payment_method_id = "pix",
            payer = new { email = request.GuestEmail },
            external_reference = request.BookingUid,
            notification_url = config["MercadoPago:NotificationUrl"],
            // Comissão do marketplace retida na origem; o restante liquida na conta do vendedor.
            application_fee = request.ApplicationFeeCents / 100m,
        });

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, Api)
            { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // Idempotência: evita cobrança duplicada em retries (§9).
            req.Headers.Add("X-Idempotency-Key", $"charge_{request.BookingUid}");

            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[MPSplit] Criar PIX split falhou ({Status})", (int)res.StatusCode); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[MPSplit] Criar PIX split falhou — corpo da resposta: {Body}", body);
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var id = root.GetProperty("id").GetRawText().Trim('"');
            var status = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";

            string? qr = null, qrB64 = null, ticket = null;
            if (root.TryGetProperty("point_of_interaction", out var poi) &&
                poi.TryGetProperty("transaction_data", out var td))
            {
                if (td.TryGetProperty("qr_code", out var a)) qr = a.GetString();
                if (td.TryGetProperty("qr_code_base64", out var b)) qrB64 = b.GetString();
                if (td.TryGetProperty("ticket_url", out var c)) ticket = c.GetString();
            }

            return new SplitChargeResult(id, ClientSecret: null, Status: status,
                PixQrCode: qr, PixQrCodeBase64: qrB64, PixTicketUrl: ticket);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[MPSplit] Erro ao criar PIX split para booking {Uid}", request.BookingUid);
            return null;
        }
    }

    public async Task<RefundResult?> RefundAsync(string providerPaymentId, int? amountCents = null, CancellationToken ct = default)
    {
        var token = config["MercadoPago:AccessToken"];
        if (string.IsNullOrWhiteSpace(token)) return null;

        // Reembolso total (sem corpo) ou parcial (com amount). MP devolve a fee proporcionalmente (§10.5).
        var content = amountCents is { } amt
            ? new StringContent(JsonSerializer.Serialize(new { amount = amt / 100m }), Encoding.UTF8, "application/json")
            : null;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{Api}/{providerPaymentId}/refunds")
            { Content = content };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            req.Headers.Add("X-Idempotency-Key", $"refund_{providerPaymentId}");

            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[MPSplit] Reembolso falhou ({Status})", (int)res.StatusCode); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[MPSplit] Reembolso falhou — corpo da resposta: {Body}", body);
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var id = root.TryGetProperty("id", out var idEl) ? idEl.GetRawText().Trim('"') : providerPaymentId;
            var status = root.TryGetProperty("status", out var st) ? st.GetString() ?? "approved" : "approved";
            var amount = root.TryGetProperty("amount", out var am) && am.TryGetDecimal(out var d) ? (int)(d * 100) : amountCents ?? 0;
            return new RefundResult(id, status, amount);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[MPSplit] Erro ao reembolsar {PaymentId}", providerPaymentId);
            return null;
        }
    }

    /// <summary>
    /// Resolve o access token do vendedor para a conta conectada. TODO (§8/§9): buscar no secret store
    /// o token OAuth por <paramref name="externalAccountId"/> (MP user_id). Hoje usa o token do marketplace.
    /// </summary>
    private string? ResolveSellerAccessToken(string externalAccountId)
    {
        var perSeller = config[$"MercadoPago:SellerTokens:{externalAccountId}"];
        return !string.IsNullOrWhiteSpace(perSeller) ? perSeller : config["MercadoPago:AccessToken"];
    }
}
