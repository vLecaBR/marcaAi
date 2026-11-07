using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>Página pública do profissional (perfil + tipos de consulta ativos).</summary>
[ApiController]
[Route("api/v1/public")]
public sealed class PublicController(IApplicationDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("{username}")]
    public async Task<ActionResult<PublicProfileDto>> Profile(string username, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking()
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
                        e.RequiresConfirm, e.BeforeEventBuffer, e.AfterEventBuffer, e.BookingLimitDays))
                    .ToList()))
            .FirstOrDefaultAsync(ct);

        return user is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, detail: "Profissional não encontrado.")
            : Ok(user);
    }
}
