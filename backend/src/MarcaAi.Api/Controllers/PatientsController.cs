using MarcaAi.Api.Auth;
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

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PatientSummaryDto>>> List([FromQuery] string? q, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var rows = await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.StartTime)
            .Take(5000)
            .Select(b => new
            {
                b.GuestEmail, b.GuestName, b.GuestPhone, b.StartTime, b.Status, b.PaymentStatus, b.PriceCents,
            })
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var list = rows
            .GroupBy(r => r.GuestEmail.Trim().ToLowerInvariant())
            .Select(g =>
            {
                var latest = g.First(); // já ordenado do mais recente para o mais antigo
                var active = g.Where(x => x.Status != BookingStatus.CANCELLED).ToList();
                return new PatientSummaryDto(
                    g.Key, latest.GuestName, g.Select(x => x.GuestPhone).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p)),
                    active.Count, g.Count() - active.Count,
                    active.Where(x => x.StartTime <= now).Select(x => (DateTime?)x.StartTime).DefaultIfEmpty().Max(),
                    active.Where(x => x.StartTime > now).Select(x => (DateTime?)x.StartTime).DefaultIfEmpty().Min(),
                    g.Where(x => x.PaymentStatus == PaymentStatus.PAID).Sum(x => (long)(x.PriceCents ?? 0)));
            });

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            list = list.Where(p =>
                p.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                p.Email.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (p.Phone ?? "").Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        return Ok(list.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).ToList());
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
