using System.Security.Claims;
using System.Security.Cryptography;
using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Auth;
using MarcaAi.Domain.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Login via Google (OAuth code flow, só identidade; a agenda é conectada em outro fluxo). O handler "Google" (Program.cs) processa o CallbackPath
/// e assina no cookie temporário "ext"; aqui finalizamos: provisionamos o usuário e guardamos os
/// tokens do Calendar na Account.
///
/// Cookie cross-domain: a API e o frontend vivem em domínios diferentes, então a sessão NÃO pode
/// ser emitida aqui (o cookie ficaria preso no domínio da API). Em vez disso o /complete gera um
/// código de troca de uso único e redireciona para {FRONT}/auth/callback?code=..., e o frontend
/// troca o código pela sessão no /exchange e re-emite o cookie no domínio dele — mesmo princípio
/// do magic link, que já funciona.
///
/// Só é registrado se houver Google:ClientId/ClientSecret configurados.
/// </summary>
[ApiController]
[Route("api/v1/auth/google")]
public sealed class GoogleAuthController(
    IApplicationDbContext db,
    IUserProvisioning provisioning,
    AuthSessionWriter session,
    IConfiguration config) : ControllerBase
{
    /// <summary>Janela curta para trocar o código pela sessão (uso único).</summary>
    private static readonly TimeSpan HandoffTtl = TimeSpan.FromMinutes(2);

    /// <summary>Prefixo no Identifier do token para distinguir o handoff do Google de um magic link.</summary>
    private const string HandoffIdentifierPrefix = "google-handoff:";

    /// <summary>Chave do plano retido carregada no state do OAuth (bug 1).</summary>
    private const string PlanStateKey = "plan";

    /// <summary>Tamanho máximo defensivo do código de plano ecoado (ex.: "CLINICA_PRO").</summary>
    private const int MaxPlanCodeLength = 32;

    /// <summary>
    /// Inicia o fluxo — redireciona para o consentimento do Google. Se um <paramref name="plan"/>
    /// (intenção de checkout) vier da tela de login, é guardado em <c>Items</c> das
    /// <see cref="AuthenticationProperties"/>: o handler serializa isso no <c>state</c> do OAuth,
    /// que retorna intacto no <see cref="Complete"/> — sobrevivendo ao round-trip pelo Google (bug 1).
    /// </summary>
    [AllowAnonymous]
    [HttpGet("start")]
    public IActionResult Start([FromQuery] string? plan = null)
    {
        var props = new AuthenticationProperties { RedirectUri = Url.Action(nameof(Complete)) };
        if (IsPlausiblePlanCode(plan)) props.Items[PlanStateKey] = plan;
        return Challenge(props, "Google");
    }

    /// <summary>
    /// Finaliza o handshake do Google: provisiona o usuário, gera um código de troca de uso único
    /// e redireciona ao frontend. NÃO emite a sessão aqui (ver nota da classe sobre cross-domain).
    /// </summary>
    [AllowAnonymous]
    [HttpGet("complete")]
    public async Task<IActionResult> Complete(CancellationToken ct)
    {
        var result = await HttpContext.AuthenticateAsync("ext");
        if (!result.Succeeded || result.Principal is null || result.Properties is null)
            return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Falha na autenticação com o Google.");

        var email = result.Principal.FindFirstValue(ClaimTypes.Email);
        var name = result.Principal.FindFirstValue(ClaimTypes.Name);
        var googleSub = result.Principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(googleSub))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Perfil do Google incompleto.");

        // Login não guarda tokens do Google (escopos só de identidade). Calendar é conectado à parte.
        var user = await provisioning.FindOrCreateByEmailAsync(email, ct);
        if (string.IsNullOrWhiteSpace(user.Name) && !string.IsNullOrWhiteSpace(name))
        {
            user.Name = name;
            await db.SaveChangesAsync(ct);
        }

        await HttpContext.SignOutAsync("ext"); // limpa o cookie temporário do handshake

        // Código de troca de uso único (reaproveita a tabela VerificationToken, como o magic link).
        var code = Base64UrlToken(32);
        db.VerificationTokens.Add(new VerificationToken
        {
            Identifier = HandoffIdentifierPrefix + user.Email,
            Token = code,
            Expires = DateTime.UtcNow.Add(HandoffTtl),
        });
        await db.SaveChangesAsync(ct);

        // Contrato: docs/backend-backlog.md → "Contrato de redirect do front".
        var frontend = (config["Cors:FrontendOrigin"] ?? "http://localhost:3000").TrimEnd('/');
        var url = $"{frontend}/auth/callback?code={Uri.EscapeDataString(code)}";

        // Bug 1: repassa a intenção de plano recuperada do state para o `/auth/callback` do front,
        // que grava o cookie same-site e dispara o checkout ao chegar no dashboard.
        if (result.Properties.Items.TryGetValue(PlanStateKey, out var plan) && IsPlausiblePlanCode(plan))
            url += $"&plan={Uri.EscapeDataString(plan!)}";

        return Redirect(url);
    }

    /// <summary>
    /// Validação defensiva do código de plano ecoado (não é a fonte da verdade — o front revalida
    /// contra o catálogo). Aceita apenas [A-Z0-9_] curto, evitando open-redirect/param injection.
    /// </summary>
    private static bool IsPlausiblePlanCode(string? plan) =>
        !string.IsNullOrEmpty(plan)
        && plan.Length <= MaxPlanCodeLength
        && plan.All(c => c is (>= 'A' and <= 'Z') or (>= '0' and <= '9') or '_');

    /// <summary>
    /// Troca o código de handoff pela sessão (uso único). Chamado server-side pelo /auth/callback do
    /// frontend, que re-emite os cookies de sessão no próprio domínio.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("exchange")]
    public async Task<ActionResult<MeDto>> Exchange([FromQuery] string code, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Código ausente.");

        var vt = await db.VerificationTokens.FirstOrDefaultAsync(v => v.Token == code, ct);
        if (vt is null
            || !vt.Identifier.StartsWith(HandoffIdentifierPrefix, StringComparison.Ordinal)
            || vt.Expires < DateTime.UtcNow)
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Código inválido ou expirado.");

        db.VerificationTokens.Remove(vt); // uso único
        await db.SaveChangesAsync(ct);

        var email = vt.Identifier[HandoffIdentifierPrefix.Length..];
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null)
            return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Usuário não encontrado.");

        session.Issue(HttpContext, user); // agora sim: cookies vão na resposta que o front re-emite
        return Ok(new MeDto
        {
            Id = user.Id,
            Email = user.Email,
            Name = user.Name,
            Username = user.Username,
            Onboarded = user.Onboarded,
            TimeZone = user.TimeZone,
        });
    }

    private static string Base64UrlToken(int bytes)
    {
        var buf = RandomNumberGenerator.GetBytes(bytes);
        return Convert.ToBase64String(buf).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
