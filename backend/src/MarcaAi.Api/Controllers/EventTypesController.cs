using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.EventTypes;
using MarcaAi.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>CRUD dos tipos de consulta/sessão do profissional autenticado.</summary>
[ApiController]
[Route("api/v1/event-types")]
[Authorize]
public sealed class EventTypesController(IApplicationDbContext db) : ControllerBase
{
    public sealed record ToggleStatusInput(bool IsActive);

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<EventTypeSummaryDto>>> List(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var items = await db.EventTypes.AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderBy(e => e.CreatedAt)
            .Select(e => new EventTypeSummaryDto
            {
                Id = e.Id,
                Title = e.Title,
                Slug = e.Slug,
                Description = e.Description,
                Duration = e.Duration,
                Color = e.Color,
                IsActive = e.IsActive,
                RequiresConfirm = e.RequiresConfirm,
                LocationType = e.LocationType,
                Price = e.Price,
                Currency = e.Currency,
                BookingCount = e.Bookings.Count(),
            })
            .ToListAsync(ct);

        return Ok(items);
    }

    /// <summary>Detalhe completo (buffers, limite, local e perguntas) para o formulário de edição.</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<EventTypeDetailDto>> Get(string id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var e = await db.EventTypes.AsNoTracking().Include(x => x.Questions)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
        if (e is null) return NotFound();

        return Ok(new EventTypeDetailDto(
            e.Id, e.Title, e.Slug, e.Description, e.Duration, e.Color, e.IsActive, e.RequiresConfirm,
            e.BeforeEventBuffer, e.AfterEventBuffer, e.BookingLimitDays, e.LocationType, e.LocationValue,
            e.Price, e.Currency,
            e.Questions.OrderBy(q => q.Order)
                .Select(q => new QuestionDto(q.Id, q.Label, q.Type, q.Placeholder, q.Required, q.Order)).ToList()));
    }

    [HttpPost]
    public async Task<ActionResult<EventTypeSummaryDto>> Create([FromBody] EventTypeInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var error = Validate(input);
        if (error is not null) return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: error);

        if (await db.EventTypes.AnyAsync(e => e.UserId == userId && e.Slug == input.Slug, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Você já tem um evento com este slug.");

        var entity = new EventType { UserId = userId };
        Apply(entity, input);
        ReplaceQuestions(entity, input);
        db.EventTypes.Add(entity);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(List), null, Project(entity));
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<EventTypeSummaryDto>> Update(string id, [FromBody] EventTypeInput input, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var error = Validate(input);
        if (error is not null) return Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: error);

        var entity = await db.EventTypes.Include(e => e.Questions).FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId, ct);
        if (entity is null) return NotFound();

        if (await db.EventTypes.AnyAsync(e => e.UserId == userId && e.Slug == input.Slug && e.Id != id, ct))
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Você já tem um evento com este slug.");

        Apply(entity, input);
        ReplaceQuestions(entity, input);
        await db.SaveChangesAsync(ct);
        return Ok(Project(entity));
    }

    [HttpPatch("{id}/status")]
    public async Task<IActionResult> ToggleStatus(string id, [FromBody] ToggleStatusInput body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var entity = await db.EventTypes.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId, ct);
        if (entity is null) return NotFound();

        entity.IsActive = body.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var entity = await db.EventTypes.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId, ct);
        if (entity is null) return NotFound();

        db.EventTypes.Remove(entity);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── helpers ────────────────────────────────────────────────────────────
    private static string? Validate(EventTypeInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Title)) return "Título é obrigatório.";
        if (string.IsNullOrWhiteSpace(i.Slug)) return "Slug é obrigatório.";
        if (i.Duration is < 1 or > 1440) return "Duração deve estar entre 1 e 1440 minutos.";
        if (i.BeforeEventBuffer < 0 || i.AfterEventBuffer < 0) return "Buffers não podem ser negativos.";
        if (i.Price is < 0) return "Preço não pode ser negativo.";
        if (i.Questions is { Count: > 20 }) return "No máximo 20 perguntas por tipo de consulta.";
        if (i.Questions is not null && i.Questions.Any(q => string.IsNullOrWhiteSpace(q.Label) || q.Label.Length > 200))
            return "Cada pergunta precisa de um texto de até 200 caracteres.";
        return null;
    }

    /// <summary>Substitui as perguntas quando o input as traz (null = mantém as existentes).</summary>
    private void ReplaceQuestions(EventType e, EventTypeInput i)
    {
        if (i.Questions is null) return;
        db.EventTypeQuestions.RemoveRange(e.Questions.ToList());
        e.Questions.Clear();
        var order = 0;
        foreach (var q in i.Questions)
        {
            e.Questions.Add(new EventTypeQuestion
            {
                Label = q.Label.Trim(), Type = q.Type, Placeholder = q.Placeholder, Required = q.Required, Order = q.Order != 0 ? q.Order : order,
            });
            order++;
        }
    }

    private static void Apply(EventType e, EventTypeInput i)
    {
        e.Title = i.Title;
        e.Slug = i.Slug;
        e.Description = i.Description;
        e.Duration = i.Duration;
        e.Color = i.Color;
        e.RequiresConfirm = i.RequiresConfirm;
        e.BeforeEventBuffer = i.BeforeEventBuffer;
        e.AfterEventBuffer = i.AfterEventBuffer;
        e.BookingLimitDays = i.BookingLimitDays;
        e.LocationType = i.LocationType;
        e.LocationValue = i.LocationValue;
        e.Price = i.Price;
        e.Currency = i.Currency;
    }

    private static EventTypeSummaryDto Project(EventType e) => new()
    {
        Id = e.Id,
        Title = e.Title,
        Slug = e.Slug,
        Description = e.Description,
        Duration = e.Duration,
        Color = e.Color,
        IsActive = e.IsActive,
        RequiresConfirm = e.RequiresConfirm,
        LocationType = e.LocationType,
        Price = e.Price,
        Currency = e.Currency,
        BookingCount = e.Bookings.Count,
    };
}
