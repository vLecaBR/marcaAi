using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Callback do OAuth do vendedor no Mercado Pago. É chamado pelo **navegador** (redirect do MP), sem cookie de
/// sessão garantido, então a autorização vem do <c>state</c> assinado (Data Protection, 15 min, ligado ao owner)
/// emitido em <c>POST /payouts/onboarding</c>. Termina redirecionando para a tela de Recebimentos do app.
/// </summary>
[ApiController]
[Route("api/v1/payouts/mercadopago")]
[AllowAnonymous]
public sealed class MercadoPagoOAuthController(
    IMercadoPagoConnectService mp, IConfiguration config, ILogger<MercadoPagoOAuthController> logger) : ControllerBase
{
    [HttpGet("callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error, CancellationToken ct)
    {
        var front = (config["App:PublicUrl"] ?? "http://localhost:3000").TrimEnd('/');
        var target = $"{front}/dashboard/recebimentos";

        if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
        {
            logger.LogInformation("[MPOAuth] Autorização cancelada/inválida pelo vendedor.");
            return Redirect($"{target}?onboarding=error");
        }

        var result = await mp.CompleteAuthorizationAsync(code, state, ct);
        return Redirect(result.Success
            ? $"{target}?onboarding=done"
            : $"{target}?onboarding=error&reason={Uri.EscapeDataString(result.ErrorCode ?? "unknown")}");
    }
}
