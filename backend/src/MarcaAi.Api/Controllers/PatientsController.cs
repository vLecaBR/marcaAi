using MarcaAi.Api.Auth;
using MarcaAi.Application.Features.Bookings;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Lista de pacientes do profissional, DERIVADA das consultas (agrupada por e-mail): contato, histórico e total pago.
/// Não há prontuário nem anotação clínica (decisão D16). Dados pessoais de saúde: só o próprio profissional enxerga os seus.
/// </summary>
[ApiController]
[Route("api/v1/patients")]
[Authorize]
public sealed class PatientsController(ApplicationDbContext db) : ControllerBase
{
    public sealed record PatientSummaryDto(
        string Email, string Name, string? Phone, int TotalBookings, int CancelledBookings,
        DateTime? LastBookingAt, DateTime? NextBookingAt, long TotalPaidCents);

    public sealed record PatientBookingDto(
        string Uid, string EventTitle, DateTime StartTime, string Status, string PaymentStatus, int? PriceCents);

    public sealed record PatientDetailDto(PatientSummaryDto Summary, IReadOnlyList<PatientBookingDto> Bookings);

    /// <summary>
    /// Pacientes paginados, agrupados por e-mail NO BANCO (nada é carregado na memória). <c>q</c> busca por nome, e-mail ou
    /// telefone em qualquer consulta do paciente. Ordem: nome (A→Z). Devolve <c>{ items, total, page, pageSize }</c>.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<PatientSummaryDto>>> List(
        [FromQuery] string? q, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var (pg, size) = PagedResult<PatientSummaryDto>.Normalize(page, pageSize);
        var now = DateTime.UtcNow;

        var rows = db.Bookings.AsNoTracking().Where(b => b.UserId == userId);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var like = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            rows = rows.Where(b => EF.Functions.ILike(b.GuestName, like) || EF.Functions.ILike(b.GuestEmail, like)
                                   || (b.GuestPhone != null && EF.Functions.ILike(b.GuestPhone, like)));
        }

        // Só agregados no GROUP BY (rápido); nome e telefone "mais recentes" vêm numa segunda consulta, só dos pacientes da página.
        var grouped = rows.GroupBy(b => b.GuestEmail.Trim().ToLower()).Select(g => new
        {
            Email = g.Key,
            Active = g.Count(x => x.Status != BookingStatus.CANCELLED),
            Cancelled = g.Count(x => x.Status == BookingStatus.CANCELLED),
            Last = g.Where(x => x.Status != BookingStatus.CANCELLED && x.StartTime <= now).Max(x => (DateTime?)x.StartTime),
            Next = g.Where(x => x.Status != BookingStatus.CANCELLED && x.StartTime > now).Min(x => (DateTime?)x.StartTime),
            Paid = g.Where(x => x.PaymentStatus == PaymentStatus.PAID).Sum(x => (long?)x.PriceCents) ?? 0,
            SortName = g.Min(x => x.GuestName),
        });

        var total = await grouped.CountAsync(ct);
        var pageRows = await grouped.OrderBy(x => x.SortName).ThenBy(x => x.Email).Skip((pg - 1) * size).Take(size).ToListAsync(ct);

        var emails = pageRows.Select(r => r.Email).ToList();
        var latest = emails.Count == 0 ? [] : await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == userId && emails.Contains(b.GuestEmail.Trim().ToLower()))
            .OrderByDescending(b => b.StartTime)
            .Select(b => new { Email = b.GuestEmail.Trim().ToLower(), b.GuestName, b.GuestPhone }).ToListAsync(ct);
        var byEmail = latest.GroupBy(x => x.Email).ToDictionary(g => g.Key, g => (
            Name: g.First().GuestName, Phone: g.Select(x => x.GuestPhone).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p))));

        var items = pageRows.Select(x => new PatientSummaryDto(
            x.Email, byEmail.TryGetValue(x.Email, out var d) ? d.Name : x.SortName, byEmail.TryGetValue(x.Email, out var d2) ? d2.Phone : null,
            x.Active, x.Cancelled, x.Last, x.Next, x.Paid)).ToList();
        return Ok(new PagedResult<PatientSummaryDto>(items, total, pg, size));
    }

    /// <summary>Histórico de consultas de um paciente (por e-mail).</summary>
    [HttpGet("detail")]
    public async Task<ActionResult<PatientDetailDto>> Detail([FromQuery] string email, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var key = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(key)) return Problem(statusCode: 422, detail: "E-mail do paciente é obrigatório.");

        var rows = await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == userId && b.GuestEmail.ToLower() == key)
            .OrderByDescending(b => b.StartTime)
            .Select(b => new
            {
                b.Uid, b.EventType.Title, b.StartTime, b.Status, b.PaymentStatus, b.PriceCents, b.GuestName, b.GuestPhone, b.GuestEmail,
            })
            .ToListAsync(ct);
        if (rows.Count == 0) return NotFound();

        var now = DateTime.UtcNow;
        var active = rows.Where(x => x.Status != BookingStatus.CANCELLED).ToList();
        var summary = new PatientSummaryDto(
            key, rows[0].GuestName, rows.Select(x => x.GuestPhone).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p)),
            active.Count, rows.Count - active.Count,
            active.Where(x => x.StartTime <= now).Select(x => (DateTime?)x.StartTime).DefaultIfEmpty().Max(),
            active.Where(x => x.StartTime > now).Select(x => (DateTime?)x.StartTime).DefaultIfEmpty().Min(),
            rows.Where(x => x.PaymentStatus == PaymentStatus.PAID).Sum(x => (long)(x.PriceCents ?? 0)));

        return Ok(new PatientDetailDto(summary,
            rows.Select(x => new PatientBookingDto(x.Uid, x.Title, x.StartTime, x.Status.ToString(), x.PaymentStatus.ToString(), x.PriceCents)).ToList()));
    }
}
