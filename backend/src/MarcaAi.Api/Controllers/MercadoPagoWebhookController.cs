using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Payments;
using MarcaAi.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Webhook do Mercado Pago: confirma pagamentos PIX e marca a consulta como PAID.
/// Segurança (F5): (1) assinatura <c>x-signature</c> validada com <c>MercadoPago:WebhookSecret</c> (HMAC-SHA256, anti-replay);
/// (2) o pagamento é **reconsultado na API do MP com o token do vendedor** — o corpo do webhook nunca é confiável;
/// (3) valor e <c>external_reference</c> precisam bater com o snapshot do booking; (4) idempotente por <c>x-request-id</c>.
/// </summary>
[ApiController]
[Route("api/v1/webhooks/mercadopago")]
[AllowAnonymous]
public sealed class MercadoPagoWebhookController(
    IPixPaymentService pix, IMercadoPagoConnectService sellers, IWebhookEventStore events,
    IApplicationDbContext db, IBookingService bookings, IConfiguration config, ILogger<MercadoPagoWebhookController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Handle(CancellationToken ct)
    {
        var secret = config["MercadoPago:WebhookSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            logger.LogError("[MPWebhook] MercadoPago:WebhookSecret ausente — webhook recusado (fail-closed).");
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(ct);

        // O id do pagamento vem em query (data.id / id) ou no corpo { data: { id } }.
        var paymentId = Request.Query["data.id"].FirstOrDefault() ?? Request.Query["id"].FirstOrDefault();
        if (string.IsNullOrEmpty(paymentId) && !string.IsNullOrWhiteSpace(body))
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("data", out var data) && data.TryGetProperty("id", out var idEl))
                    paymentId = idEl.ValueKind == JsonValueKind.String ? idEl.GetString() : idEl.GetRawText();
            }
            catch (JsonException) { /* corpo não-JSON: ignora */ }
        }

        var requestId = Request.Headers["x-request-id"].FirstOrDefault();
        // O manifesto assinado usa o data.id da QUERY string.
        var signedId = Request.Query["data.id"].FirstOrDefault() ?? paymentId;
        if (!MercadoPagoSignature.IsValid(secret, Request.Headers["x-signature"].FirstOrDefault(), requestId, signedId, DateTimeOffset.UtcNow))
        {
            logger.LogWarning("[MPWebhook] Assinatura inválida.");
            return Unauthorized();
        }

        if (string.IsNullOrEmpty(paymentId)) return Ok(); // evento sem pagamento — ignora
        if (!string.IsNullOrEmpty(requestId) && await events.WasProcessedAsync("mercadopago", requestId, ct)) return Ok();

        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.ProviderPaymentId == paymentId, ct);
        if (booking is null) { logger.LogInformation("[MPWebhook] Pagamento {PaymentId} sem booking conhecido.", paymentId); return Ok(); }

        // Proteção contra double-processing: só grava a baixa uma vez.
        if (booking.PaymentStatus != PaymentStatus.PAID)
        {
            var externalId = booking.PayoutAccountId is null ? null
                : await db.PayoutAccounts.AsNoTracking().Where(a => a.Id == booking.PayoutAccountId)
                    .Select(a => a.ExternalAccountId).FirstOrDefaultAsync(ct);
            var token = externalId is null ? null : await sellers.GetSellerAccessTokenAsync(externalId, ct);
            if (string.IsNullOrWhiteSpace(token))
            {
                logger.LogError("[MPWebhook] Token do vendedor indisponível para o booking {Uid}.", booking.Uid);
                return StatusCode(StatusCodes.Status500InternalServerError); // MP reenvia
            }

            var info = await pix.GetPaymentAsync(paymentId, token, ct);
            if (info is null) return StatusCode(StatusCodes.Status500InternalServerError); // MP reenvia

            if (info.Status == "approved")
            {
                if (info.ExternalReference != booking.Uid || (booking.PriceCents is { } price && info.AmountCents != price))
                {
                    logger.LogError(
                        "[MPWebhook] Pagamento {PaymentId} divergente do snapshot do booking {Uid} — baixa NÃO aplicada.",
                        paymentId, booking.Uid);
                    return Ok();
                }

                // Snapshot financeiro imutável: fees/net já foram gravados na iniciação (BookingPaymentService).
                booking.PaymentStatus = PaymentStatus.PAID;
                booking.PaidAt = DateTime.UtcNow;
                booking.PaymentProvider ??= PaymentProvider.MERCADO_PAGO;
                await db.SaveChangesAsync(ct);
                await bookings.OnPaymentConfirmedAsync(booking.Uid, ct);
            }
            else if (info.Status is "rejected" or "cancelled")
            {
                booking.PaymentStatus = PaymentStatus.FAILED;
                await db.SaveChangesAsync(ct);
            }
            else if (info.Status is "refunded" or "charged_back")
            {
                booking.PaymentStatus = PaymentStatus.REFUNDED;
                booking.RefundedAt ??= DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }

        if (!string.IsNullOrEmpty(requestId)) await events.MarkProcessedAsync("mercadopago", requestId, ct);
        return Ok();
    }
}
