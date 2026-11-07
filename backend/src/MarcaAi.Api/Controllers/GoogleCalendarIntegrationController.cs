using System.Security.Cryptography;
using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// "Conectar Google Agenda" (opcional) — fluxo OAuth **separado do login** (achado #15): o login pede só
/// <c>openid email profile</c> (escopos não sensíveis); aqui pedimos os escopos de Calendar com
/// <c>access_type=offline</c>, a partir de dentro do dashboard.
///
/// A sessão do usuário vive no domínio do front (BFF), então o navegador não envia o cookie à API. O front chama
/// <c>POST link</c> (autenticado) e recebe um código de uso único (5 min); o navegador então abre
/// <c>GET start?link=…</c> na API, que consome o código e liga o fluxo OAuth ao usuário correto (userId vai no
/// <c>state</c> protegido do OAuth — não é adulterável). O callback grava os tokens e volta ao front.
/// </summary>
[ApiController]
[Route("api/v1/integrations/google-calendar")]
public sealed class GoogleCalendarIntegrationController(
    IApplicationDbContext db, IConfiguration config, IHttpClientFactory httpFactory,
    ILogger<GoogleCalendarIntegrationController> logger) : ControllerBase
{
    private const string LinkPrefix = "gcal-link:";
    private const string UserKey = "uid";
    private static readonly TimeSpan LinkTtl = TimeSpan.FromMinutes(5);
    private const string CalendarScope = "https://www.googleapis.com/auth/calendar.events";

    private string Front => (config["Cors:FrontendOrigin"] ?? "http://localhost:3000").TrimEnd('/');

    public sealed record StatusDto(bool Available, bool Connected);

    /// <summary>Estado da conexão (Available = credenciais do Google configuradas no servidor).</summary>
    [Authorize]
    [HttpGet]
    public async Task<ActionResult<StatusDto>> Status(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var available = !string.IsNullOrWhiteSpace(config["Google:ClientId"]) && !string.IsNullOrWhiteSpace(config["Google:ClientSecret"]);
        var connected = await db.Accounts.AsNoTracking().AnyAsync(a =>
            a.UserId == userId && a.Provider == "google" && a.RefreshToken != null && a.Scope != null && a.Scope.Contains("calendar"), ct);
        return Ok(new StatusDto(available, connected));
    }

    /// <summary>Emite o código de uso único que autoriza o início do OAuth do Calendar para o usuário logado.</summary>
    [Authorize]
    [HttpPost("link")]
    public async Task<IActionResult> CreateLink(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(config["Google:ClientId"]))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, detail: "Integração com o Google não configurada.");

        var code = Base64UrlToken(32);
        db.VerificationTokens.Add(new VerificationToken { Identifier = LinkPrefix + userId, Token = code, Expires = DateTime.UtcNow.Add(LinkTtl) });
        await db.SaveChangesAsync(ct);

        return Ok(new { startUrl = $"{Request.Scheme}://{Request.Host}/api/v1/integrations/google-calendar/start?link={Uri.EscapeDataString(code)}" });
    }

    /// <summary>Abre o consentimento do Google (navegador). Consome o código; sem código válido, volta ao front com erro.</summary>
    [AllowAnonymous]
    [HttpGet("start")]
    public async Task<IActionResult> Start([FromQuery] string? link, CancellationToken ct)
    {
        var vt = string.IsNullOrEmpty(link) ? null : await db.VerificationTokens.FirstOrDefaultAsync(v => v.Token == link, ct);
        if (vt is null || vt.Expires < DateTime.UtcNow || !vt.Identifier.StartsWith(LinkPrefix, StringComparison.Ordinal))
            return Redirect($"{Front}/settings/integrations?calendar=error");

        db.VerificationTokens.Remove(vt); // uso único
        await db.SaveChangesAsync(ct);

        var props = new AuthenticationProperties { RedirectUri = Url.Action(nameof(Complete)) };
        props.Items[UserKey] = vt.Identifier[LinkPrefix.Length..];
        return Challenge(props, "GoogleCalendar");
    }

    /// <summary>Callback do consentimento: grava os tokens na conta do usuário que iniciou o fluxo.</summary>
    [AllowAnonymous]
    [HttpGet("complete")]
    public async Task<IActionResult> Complete(CancellationToken ct)
    {
        var result = await HttpContext.AuthenticateAsync("ext");
        if (!result.Succeeded || result.Properties is null || !result.Properties.Items.TryGetValue(UserKey, out var userId) || string.IsNullOrEmpty(userId))
            return Redirect($"{Front}/settings/integrations?calendar=error");

        await HttpContext.SignOutAsync("ext");

        var googleSub = result.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var refresh = result.Properties.GetTokenValue("refresh_token");
        var scope = result.Properties.GetTokenValue("scope");
        if (string.IsNullOrEmpty(googleSub) || string.IsNullOrEmpty(refresh) || scope is null || !scope.Contains("calendar"))
        {
            logger.LogWarning("[GCal] Consentimento sem refresh_token/escopo de Calendar (usuário recusou ou escopo parcial).");
            return Redirect($"{Front}/settings/integrations?calendar=denied");
        }

        // Outra conta do app já usa este Google? Não sequestra a ligação.
        var taken = await db.Accounts.AnyAsync(a => a.Provider == "google" && a.ProviderAccountId == googleSub && a.UserId != userId, ct);
        if (taken) return Redirect($"{Front}/settings/integrations?calendar=already_linked");

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.UserId == userId && a.Provider == "google", ct);
        if (account is null)
        {
            account = new Account { UserId = userId, Type = "oauth", Provider = "google" };
            db.Accounts.Add(account);
        }
        account.ProviderAccountId = googleSub;
        account.AccessToken = result.Properties.GetTokenValue("access_token");
        account.RefreshToken = refresh;
        account.ExpiresAt = DateTimeOffset.TryParse(result.Properties.GetTokenValue("expires_at"), out var exp) ? (int)exp.ToUnixTimeSeconds() : account.ExpiresAt;
        account.Scope = scope;
        account.TokenType = "Bearer";
        await db.SaveChangesAsync(ct);

        return Redirect($"{Front}/settings/integrations?calendar=connected");
    }

    /// <summary>Desconecta: revoga o token no Google (best-effort) e apaga os tokens locais.</summary>
    [Authorize]
    [HttpDelete]
    public async Task<IActionResult> Disconnect(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.UserId == userId && a.Provider == "google", ct);
        if (account is null) return NoContent();

        var token = account.RefreshToken ?? account.AccessToken;
        if (!string.IsNullOrEmpty(token))
        {
            try
            {
                using var res = await httpFactory.CreateClient().PostAsync(
                    "https://oauth2.googleapis.com/revoke",
                    new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token }), ct);
            }
            catch (Exception ex) { logger.LogWarning(ex, "[GCal] Falha ao revogar token no Google (seguindo com a remoção local)."); }
        }

        db.Accounts.Remove(account);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string Base64UrlToken(int bytes) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
