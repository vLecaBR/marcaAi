using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Profile;
using MarcaAi.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>Perfil e onboarding do profissional autenticado.</summary>
[ApiController]
[Route("api/v1/me")]
[Authorize]
public sealed class MeController(IApplicationDbContext db) : ControllerBase
{
    /// <summary>Perfil editável do profissional autenticado (pré-preenche o formulário).</summary>
    [HttpGet("profile")]
    public async Task<ActionResult<ProfileDto>> GetProfile(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var dto = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new ProfileDto(
                u.Name, u.Username, u.TimeZone, u.Bio, u.Image, u.Theme.ToString(), u.BrandColor,
                u.Specialty, u.Council, u.RegistrationNumber, u.ClinicName, u.Onboarded))
            .FirstOrDefaultAsync(ct);
        return dto is null ? Unauthorized() : Ok(dto);
    }

    /// <summary>Atualiza o perfil. Após isso, chame POST /api/v1/auth/refresh para o token refletir o novo username/onboarded.</summary>
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(input.Username))
            return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: "Username é obrigatório.");
        if (string.IsNullOrWhiteSpace(input.TimeZone))
            return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: "Fuso horário é obrigatório.");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Unauthorized();

        if (await db.Users.AnyAsync(u => u.Username == input.Username && u.Id != userId, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Este username já está em uso.");

        user.Name = input.Name;
        user.Username = input.Username;
        user.TimeZone = input.TimeZone;
        user.Bio = input.Bio;
        if (Enum.TryParse<Theme>(input.Theme, ignoreCase: true, out var theme)) user.Theme = theme;
        if (!string.IsNullOrWhiteSpace(input.BrandColor)) user.BrandColor = input.BrandColor;
        user.Specialty = Clean(input.Specialty, 120);
        user.Council = Clean(input.Council, 20);
        user.RegistrationNumber = Clean(input.RegistrationNumber, 30);
        user.ClinicName = Clean(input.ClinicName, 120);

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string? Clean(string? v, int max)
    {
        var t = v?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length > max ? t[..max] : t;
    }

    /// <summary>Marca o onboarding como concluído.</summary>
    [HttpPost("onboarding/complete")]
    public async Task<IActionResult> CompleteOnboarding(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Unauthorized();

        user.Onboarded = true;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
