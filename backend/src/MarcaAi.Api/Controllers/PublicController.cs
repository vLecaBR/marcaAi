using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>Página pública do profissional (perfil + tipos de consulta ativos).</summary>
[ApiController]
[Route("api/v1/public")]
public sealed class PublicController(IApplicationDbContext db, IReadCache cache) : ControllerBase
{
    /// <summary>Página pública da clínica: dados da equipe + profissionais já cadastrados (sem e-mail).</summary>
    [AllowAnonymous]
    [EnableRateLimiting("public-read")]
    [HttpGet("team/{slug}")]
    public async Task<ActionResult<PublicTeamDto>> Team(string slug, CancellationToken ct)
    {
        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Slug == slug)
            .Select(t => new PublicTeamDto(
                t.Slug, t.Name, t.Description, t.Logo, t.BrandColor, t.Theme,
                t.Members
                    .Where(m => m.User.Username != null && m.User.Onboarded)
                    .OrderBy(m => m.User.Name)
                    .Select(m => new PublicTeamMemberDto(m.User.Username!, m.User.Name, m.User.Image, m.User.Specialty, m.User.Council))
                    .ToList()))
            .FirstOrDefaultAsync(ct);

        return team is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, detail: "Clínica não encontrada.")
            : Ok(team);
    }

    [AllowAnonymous]
    [EnableRateLimiting("public-read")]
    [HttpGet("{username}")]
    public async Task<ActionResult<PublicProfileDto>> Profile(string username, CancellationToken ct)
    {
        // 60 s de cache; qualquer gravação em usuário/tipo de consulta/pergunta o invalida na hora (ver CacheInvalidationInterceptor).
        var user = await cache.GetOrCreateAsync("public-profile", IReadCache.ProfilesScope, username, TimeSpan.FromSeconds(60),
            () => LoadProfileAsync(username, ct), shouldCache: p => p is not null);

        return user is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, detail: "Profissional não encontrado.")
            : Ok(user);
    }

    private async Task<PublicProfileDto?> LoadProfileAsync(string username, CancellationToken ct)
    {
        return await db.Users.AsNoTracking()
            .Where(u => u.Username == username)
            .Select(u => new PublicProfileDto(
                u.Id,
                u.Username!,
                u.Name,
                u.Bio,
                u.Image,
                u.BrandColor,
                u.Theme,
                u.TimeZone,
                u.EventTypes
                    .Where(e => e.IsActive)
                    .OrderBy(e => e.CreatedAt)
                    .Select(e => new PublicEventTypeDto(
                        e.Id, e.Title, e.Slug, e.Description, e.Duration,
                        e.Color, e.LocationType, e.Price, e.Currency,
                        e.RequiresConfirm, e.BeforeEventBuffer, e.AfterEventBuffer, e.BookingLimitDays,
                        e.Questions.OrderBy(q => q.Order)
                            .Select(q => new PublicQuestionDto(q.Id, q.Label, q.Type, q.Placeholder, q.Required, q.Order))
                            .ToList(), e.PayOnSite))
                    .ToList()))
            .FirstOrDefaultAsync(ct);
    }
}
