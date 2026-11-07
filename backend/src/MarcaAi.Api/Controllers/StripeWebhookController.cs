using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Webhooks do Stripe. Dois endpoints com secrets de assinatura distintos:
/// - <c>POST .../stripe</c>         → eventos de Billing/assinatura (IBillingService).
/// - <c>POST .../stripe/connect</c> → eventos do Connect: KYC de conta + baixa/reembolso de split.
/// Endpoints separados porque cada um valida com seu próprio signing secret (Stripe:WebhookSecret
/// vs Stripe:ConnectWebhookSecret) — mistura de secrets num único endpoint quebraria a verificação.
/// </summary>
[ApiController]
[Route("api/v1/webhooks/stripe")]
[AllowAnonymous]
public sealed class StripeWebhookController(
    IBillingService billing, IStripeConnectWebhookHandler connect) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Handle(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(ct);
        var signature = Request.Headers["Stripe-Signature"].ToString();

        if (string.IsNullOrEmpty(signature))
            return BadRequest("Assinatura ausente.");

        try
        {
            await billing.HandleWebhookAsync(payload, signature, ct);
            // Cobranças de consulta (destination charge) também chegam aqui: payment_intent.* e charge.refunded.
            await connect.HandlePlatformPaymentEventsAsync(payload, signature, ct);
            return Ok();
        }
        catch (Stripe.StripeException)
        {
            return BadRequest("Assinatura inválida.");
        }
        catch
        {
            // Retorna 500 para o Stripe reenviar.
            return StatusCode(StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Eventos do Stripe Connect (account.updated, payment_intent.succeeded, charge.refunded).</summary>
    [HttpPost("connect")]
    public async Task<IActionResult> HandleConnect(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(ct);
        var signature = Request.Headers["Stripe-Signature"].ToString();

        if (string.IsNullOrEmpty(signature))
            return BadRequest("Assinatura ausente.");

        try
        {
            await connect.HandleConnectWebhookAsync(payload, signature, ct);
            return Ok();
        }
        catch (Stripe.StripeException)
        {
            return BadRequest("Assinatura inválida.");
        }
        catch
        {
            // Retorna 500 para o Stripe reenviar.
            return StatusCode(StatusCodes.Status500InternalServerError);
        }
    }
}
