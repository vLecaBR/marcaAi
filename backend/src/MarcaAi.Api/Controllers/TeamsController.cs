using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Teams;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Clínicas/equipes multiprofissionais. RBAC (OWNER/ADMIN/MEMBER) é verificado por request
/// contra a associação do usuário na equipe — não via claim, pois um usuário pode ter papéis
/// diferentes em equipes diferentes.
/// </summary>
[ApiController]
[Route("api/v1/teams")]
[Authorize]
public sealed class TeamsController(IApplicationDbContext db, IPlanAccessService plans) : ControllerBase
{
    // ── Listar as equipes do usuário ─────────────────────────────────────────
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TeamDto>>> List(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var teams = await db.TeamMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new TeamDto(
                m.Team.Id, m.Team.Name, m.Team.Slug, m.Team.Description, m.Team.Logo,
                m.Team.Theme, m.Team.BrandColor, m.Role, m.Team.Members.Count))
            .ToListAsync(ct);

        return Ok(teams);
    }

    // ── Detalhe (precisa ser membro) ─────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<ActionResult<TeamDetailDto>> Get(string id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var role = await RoleAsync(id, userId, ct);
        if (role is null) return NotFound();

        var team = await db.Teams.AsNoTracking()
            .Where(t => t.Id == id)
            .Select(t => new TeamDetailDto(
                t.Id, t.Name, t.Slug, t.Description, t.Logo, t.Theme, t.BrandColor, role.Value,
                t.Members
                    .OrderByDescending(mm => mm.Role)
                    .Select(mm => new TeamMemberDto(mm.UserId, mm.User.Name, mm.User.Email, mm.Role))
                    .ToList()))
            .FirstOrDefaultAsync(ct);

        return team is null ? NotFound() : Ok(team);
    }

    // ── Criar (o criador vira OWNER) ─────────────────────────────────────────
    [HttpPost]
    public async Task<ActionResult<TeamDto>> Create([FromBody] TeamInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var err = ValidateTeam(input);
        if (err is not null) return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: err);

        if (await db.Teams.AnyAsync(t => t.Slug == input.Slug, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Este slug já está em uso por outra equipe.");

        var team = new Team
        {
            Name = input.Name, Slug = input.Slug, Description = input.Description, Logo = input.Logo,
            TrialEndsAt = DateTime.UtcNow.AddDays(MarcaAi.Application.Features.Billing.TrialPolicy.Days),
        };
        if (Enum.TryParse<Theme>(input.Theme, true, out var th)) team.Theme = th;
        if (!string.IsNullOrWhiteSpace(input.BrandColor)) team.BrandColor = input.BrandColor;
        team.Members.Add(new TeamMember { UserId = userId, Role = TeamRole.OWNER });

        db.Teams.Add(team);
        await db.SaveChangesAsync(ct); // Team + membership numa transação implícita

        return CreatedAtAction(nameof(Get), new { id = team.Id },
            new TeamDto(team.Id, team.Name, team.Slug, team.Description, team.Logo, team.Theme, team.BrandColor, TeamRole.OWNER, 1));
    }

    // ── Atualizar (OWNER/ADMIN) ──────────────────────────────────────────────
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] TeamInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var err = ValidateTeam(input);
        if (err is not null) return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: err);

        var role = await RoleAsync(id, userId, ct);
        if (role is null) return NotFound();
        if (role is not (TeamRole.OWNER or TeamRole.ADMIN))
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Sem permissão para editar.");

        if (await db.Teams.AnyAsync(t => t.Slug == input.Slug && t.Id != id, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Este slug já está em uso por outra equipe.");

        var team = await db.Teams.FirstAsync(t => t.Id == id, ct);

        // Enforcement premium (Q7): personalização de marca (BrandColor) exige o recurso no plano.
        var brandingChanged = !string.IsNullOrWhiteSpace(input.BrandColor) && input.BrandColor != team.BrandColor;
        if (brandingChanged && !await plans.TeamHasFeatureAsync(id, "custom_branding", ct))
            return Problem(statusCode: StatusCodes.Status403Forbidden,
                detail: "Personalização de marca é um recurso dos planos Clínica. Faça upgrade para usá-la.");

        team.Name = input.Name;
        team.Slug = input.Slug;
        team.Description = input.Description;
        team.Logo = input.Logo;
        if (Enum.TryParse<Theme>(input.Theme, true, out var th)) team.Theme = th;
        if (!string.IsNullOrWhiteSpace(input.BrandColor)) team.BrandColor = input.BrandColor;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Convidar membro (OWNER/ADMIN) ────────────────────────────────────────
    [HttpPost("{id}/members")]
    public async Task<ActionResult<TeamMemberDto>> InviteMember(string id, [FromBody] InviteMemberInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var role = await RoleAsync(id, userId, ct);
        if (role is null) return NotFound();
        if (role is not (TeamRole.OWNER or TeamRole.ADMIN))
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Sem permissão para convidar.");

        var email = input.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email)) return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: "E-mail obrigatório.");

        var target = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (target is null)
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Usuário com este e-mail não encontrado na plataforma.");
        if (target.Id == userId)
            return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: "Você não pode convidar a si mesmo.");
        if (await db.TeamMembers.AnyAsync(m => m.TeamId == id && m.UserId == target.Id, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Este usuário já está na equipe.");

        var newRole = string.Equals(input.Role, "ADMIN", StringComparison.OrdinalIgnoreCase) ? TeamRole.ADMIN : TeamRole.MEMBER;
        db.TeamMembers.Add(new TeamMember { TeamId = id, UserId = target.Id, Role = newRole });
        await db.SaveChangesAsync(ct);

        return Ok(new TeamMemberDto(target.Id, target.Name, target.Email, newRole));
    }

    // ── Trocar papel (MEMBER <-> ADMIN) ──────────────────────────────────────
    public sealed record UpdateMemberRoleInput(TeamRole Role);

    [HttpPut("{id}/members/{targetUserId}")]
    public async Task<IActionResult> UpdateMemberRole(
        string id, string targetUserId, [FromBody] UpdateMemberRoleInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var actorRole = await RoleAsync(id, userId, ct);
        if (actorRole is null) return NotFound();
        if (actorRole is not (TeamRole.OWNER or TeamRole.ADMIN))
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Sem permissão para alterar papéis.");

        var target = await db.TeamMembers.FirstOrDefaultAsync(m => m.TeamId == id && m.UserId == targetUserId, ct);
        if (target is null) return NotFound();

        if (target.Role == TeamRole.OWNER)
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "O papel do dono não pode ser alterado. Transfira a posse.");
        if (userId == targetUserId)
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Você não pode alterar o seu próprio papel.");
        if (input.Role is not (TeamRole.ADMIN or TeamRole.MEMBER))
            return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: "Papel inválido (use ADMIN ou MEMBER).");

        target.Role = input.Role;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Remover membro ───────────────────────────────────────────────────────
    [HttpDelete("{id}/members/{targetUserId}")]
    public async Task<IActionResult> RemoveMember(string id, string targetUserId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var actorRole = await RoleAsync(id, userId, ct);
        if (actorRole is null) return NotFound();

        var target = await db.TeamMembers.FirstOrDefaultAsync(m => m.TeamId == id && m.UserId == targetUserId, ct);
        if (target is null) return NotFound();

        var isSelf = userId == targetUserId;

        // OWNER remove qualquer um. ADMIN remove MEMBERs (e a si). MEMBER só a si.
        var allowed = actorRole switch
        {
            TeamRole.OWNER => true,
            TeamRole.ADMIN => target.Role == TeamRole.MEMBER || isSelf,
            _ => isSelf,
        };
        if (!allowed)
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Sem permissão para remover este membro.");

        // Não deixar a equipe sem OWNER.
        if (target.Role == TeamRole.OWNER)
        {
            var otherOwners = await db.TeamMembers.CountAsync(m => m.TeamId == id && m.Role == TeamRole.OWNER && m.UserId != targetUserId, ct);
            if (otherOwners == 0)
                return Problem(statusCode: StatusCodes.Status409Conflict, detail: "A equipe ficaria sem dono. Transfira a posse antes.");
        }

        db.TeamMembers.Remove(target);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    private Task<TeamRole?> RoleAsync(string teamId, string userId, CancellationToken ct) =>
        db.TeamMembers.AsNoTracking()
            .Where(m => m.TeamId == teamId && m.UserId == userId)
            .Select(m => (TeamRole?)m.Role)
            .FirstOrDefaultAsync(ct);

    private static string? ValidateTeam(TeamInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name)) return "Nome é obrigatório.";
        if (string.IsNullOrWhiteSpace(i.Slug)) return "Slug é obrigatório.";
        return null;
    }
}
