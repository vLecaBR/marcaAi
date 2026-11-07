using System.Security.Cryptography;
using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Auth;
using MarcaAi.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace MarcaAi.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(
    IApplicationDbContext db,
    IUserProvisioning provisioning,
    IMagicLinkSender magicLinkSender,
    IJwtTokenService tokens,
    AuthSessionWriter session,
    IConfiguration config) : ControllerBase
{
    public sealed record MagicLinkRequest(string Email);

    private string RefreshCookie => config["Jwt:RefreshCookieName"] ?? "marcaai_rt";
    private static readonly TimeSpan LinkTtl = TimeSpan.FromMinutes(15);

    /// <summary>Solicita um magic link. Sempre responde 200 (não revela se o e-mail existe).</summary>
    [AllowAnonymous]
    [HttpPost("magic-link/request")]
    public async Task<IActionResult> RequestMagicLink([FromBody] MagicLinkRequest body, CancellationToken ct)
    {
        var email = body.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            return ValidationProblem("E-mail inválido.");

        var token = Base64UrlToken(32);
        db.VerificationTokens.Add(new VerificationToken
        {
            Identifier = email,
            Token = token,
            Expires = DateTime.UtcNow.Add(LinkTtl),
        });
        await db.SaveChangesAsync(ct);

        // O link abre o FRONT (`/auth/verify`), que troca o token pela sessão no BFF e grava os cookies no domínio do app.
        var frontend = (config["Cors:FrontendOrigin"] ?? "http://localhost:3000").TrimEnd('/');
        var link = $"{frontend}/auth/verify?token={token}";
        await magicLinkSender.SendAsync(email, link, ct);

        return Ok(new { message = "Se o e-mail for válido, enviamos um link de acesso." });
    }

    /// <summary>Valida o magic link (uso único), provisiona o usuário e emite os cookies de sessão.</summary>
    [AllowAnonymous]
    [HttpGet("magic-link/verify")]
    public async Task<ActionResult<MeDto>> Verify([FromQuery] string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Token ausente.");

        var vt = await db.VerificationTokens.FirstOrDefaultAsync(v => v.Token == token, ct);
        // Tokens de outros fluxos (handoff do Google, link de integração) têm Identifier com prefixo "xxx:" e NÃO valem como magic link.
        if (vt is null || vt.Expires < DateTime.UtcNow || vt.Identifier.Contains(':'))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Link inválido ou expirado.");

        db.VerificationTokens.Remove(vt); // uso único
        await db.SaveChangesAsync(ct);

        var user = await provisioning.FindOrCreateByEmailAsync(vt.Identifier, ct);
        session.Issue(HttpContext, user);
        return Ok(ToMe(user));
    }

    /// <summary>Renova o par de tokens a partir do refresh cookie (rotação).</summary>
    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<MeDto>> Refresh(CancellationToken ct)
    {
        if (!Request.Cookies.TryGetValue(RefreshCookie, out var rt) ||
            tokens.ValidateRefreshToken(rt) is not { } principal)
            return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Refresh inválido.");

        var userId = principal.FindFirst("sub")?.Value;
        var user = userId is null ? null : await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
            return Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Usuário não encontrado.");

        session.Issue(HttpContext, user); // re-emite ambos (rotação)
        return Ok(ToMe(user));
    }

    /// <summary>Retorna o usuário autenticado a partir das claims do access token.</summary>
    [Authorize]
    [HttpGet("me")]
    public ActionResult<MeDto> Me()
    {
        var id = User.FindFirst("sub")?.Value;
        if (id is null) return Unauthorized();
        return Ok(new MeDto
        {
            Id = id,
            Email = User.FindFirst("email")?.Value ?? string.Empty,
            Name = User.FindFirst("name")?.Value is { Length: > 0 } n ? n : null,
            Username = User.FindFirst("username")?.Value is { Length: > 0 } u ? u : null,
            Onboarded = User.FindFirst("onboarded")?.Value == "true",
            TimeZone = User.FindFirst("timeZone")?.Value ?? "America/Sao_Paulo",
        });
    }

    /// <summary>Encerra a sessão limpando os cookies.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        session.Clear(HttpContext);
        return NoContent();
    }

    private static MeDto ToMe(User u) => new()
    {
        Id = u.Id,
        Email = u.Email,
        Name = u.Name,
        Username = u.Username,
        Onboarded = u.Onboarded,
        TimeZone = u.TimeZone,
    };

    private static string Base64UrlToken(int bytes)
    {
        var buf = RandomNumberGenerator.GetBytes(bytes);
        return Convert.ToBase64String(buf).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
