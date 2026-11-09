using System.Globalization;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Availability;
using MarcaAi.Application.Scheduling;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Infrastructure.Scheduling;

/// <summary>
/// Orquestra o cálculo de disponibilidade: busca evento, agenda default e agendamentos (e os horários ocupados do Google),
/// monta o ScheduleData e delega para os calculadores puros da Application.
/// O cálculo de UM dia é o mesmo para <see cref="GetSlotsForDateAsync"/> e para <see cref="GetAvailableDaysAsync"/> (o mês carrega
/// tudo uma vez, em vez de refazer as consultas e a chamada ao Google para cada um dos ~31 dias).
/// </summary>
public sealed class AvailabilityService(ApplicationDbContext db, IGoogleCalendarService google) : IAvailabilityService
{
    public async Task<SlotsResult?> GetSlotsForDateAsync(
        string ownerId, string eventTypeId, DateOnly date, string viewerTimeZone,
        CancellationToken cancellationToken = default)
    {
        var ctx = await LoadAsync(ownerId, eventTypeId, cancellationToken);
        if (ctx is null) return null;

        // Verificamos de D-1 até D+1 para cobrir bordas de fuso (igual ao Next).
        var (fromUtc, toUtc) = DayWindow(date);
        var bookings = await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == ownerId
                && (b.Status == BookingStatus.CONFIRMED || b.Status == BookingStatus.PENDING)
                && b.StartTime < toUtc && b.EndTime > fromUtc)
            .Select(b => new BookingConflict(b.StartTime, b.EndTime))
            .ToListAsync(cancellationToken);

        // Une os agendamentos internos com os horários ocupados do Google Calendar (FreeBusy).
        var googleBusy = await google.GetBusySlotsAsync(ownerId, fromUtc, toUtc, cancellationToken);
        var conflicts = bookings.Concat(googleBusy.Select(g => new BookingConflict(g.Start, g.End))).ToList();

        return new SlotsResult(ComputeDay(ctx, date, viewerTimeZone, conflicts));
    }

    public async Task<IReadOnlyList<string>?> GetAvailableDaysAsync(
        string ownerId, string eventTypeId, DateOnly firstDayOfMonth, string viewerTimeZone,
        CancellationToken cancellationToken = default)
    {
        var ctx = await LoadAsync(ownerId, eventTypeId, cancellationToken);
        if (ctx is null) return null;

        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)); // folga de fuso; o cálculo por dia já descarta horários passados
        var days = new List<DateOnly>();
        for (var d = firstDayOfMonth; d.Month == firstDayOfMonth.Month; d = d.AddDays(1))
            if (d >= today) days.Add(d);
        if (days.Count == 0) return [];

        // Uma consulta ao banco e uma ao Google para o mês inteiro (janela = união das janelas de cada dia).
        var fromUtc = DayWindow(days[0]).From;
        var toUtc = DayWindow(days[^1]).To;
        var bookings = await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == ownerId
                && (b.Status == BookingStatus.CONFIRMED || b.Status == BookingStatus.PENDING)
                && b.StartTime < toUtc && b.EndTime > fromUtc)
            .Select(b => new BookingConflict(b.StartTime, b.EndTime))
            .ToListAsync(cancellationToken);
        var googleBusy = await google.GetBusySlotsAsync(ownerId, fromUtc, toUtc, cancellationToken);
        var all = bookings.Concat(googleBusy.Select(g => new BookingConflict(g.Start, g.End))).ToList();

        var free = new List<string>();
        foreach (var d in days)
        {
            var (from, to) = DayWindow(d);
            // Mesmo filtro de sobreposição que a consulta por dia aplica no banco.
            var dayConflicts = all.Where(c => c.StartTime < to && c.EndTime > from).ToList();
            if (ComputeDay(ctx, d, viewerTimeZone, dayConflicts).Count > 0)
                free.Add(d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        }
        return free;
    }

    // ── núcleo compartilhado ─────────────────────────────────────────────────

    private sealed record DayContext(EventType EventType, ScheduleData Schedule);

    private async Task<DayContext?> LoadAsync(string ownerId, string eventTypeId, CancellationToken ct)
    {
        var eventType = await db.EventTypes.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == eventTypeId && e.UserId == ownerId && e.IsActive, ct);
        if (eventType is null) return null;

        var schedule = await db.Schedules.AsNoTracking()
            .Include(s => s.Availabilities)
            .Include(s => s.Exceptions)
            .FirstOrDefaultAsync(s => s.UserId == ownerId && s.IsDefault, ct);
        if (schedule is null) return null;

        var scheduleData = new ScheduleData(
            schedule.TimeZone,
            schedule.Availabilities.Select(a => new AvailabilityRule(a.DayOfWeek, a.StartTime, a.EndTime)).ToList(),
            schedule.Exceptions.Select(x => new ScheduleExceptionData(x.Date, x.Type.ToString(), x.StartTime, x.EndTime)).ToList());
        return new DayContext(eventType, scheduleData);
    }

    private static (DateTime From, DateTime To) DayWindow(DateOnly date)
    {
        var dayMidUtc = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
        return (dayMidUtc.AddDays(-1), dayMidUtc.AddDays(1).AddSeconds(-1));
    }

    private static List<SlotDto> ComputeDay(DayContext ctx, DateOnly date, string viewerTimeZone, List<BookingConflict> conflicts)
    {
        var (fromUtc, toUtc) = DayWindow(date);
        var windows = AvailabilityCalculator.BuildAvailableWindows(ctx.Schedule, fromUtc, toUtc);
        var input = new SlotInput(
            ctx.EventType.Duration, ctx.EventType.BeforeEventBuffer, ctx.EventType.AfterEventBuffer,
            fromUtc, toUtc, viewerTimeZone, ctx.EventType.BookingLimitDays);

        var slots = SlotCalculator.ComputeAvailableSlots(windows, conflicts, input);
        var grouped = SlotCalculator.GroupByDate(slots, viewerTimeZone);
        var key = date.ToString("yyyy-MM-dd");
        var daySlots = grouped.TryGetValue(key, out var list) ? list : new List<Slot>();
        return daySlots.Select(s => new SlotDto(s.StartUtc, s.EndUtc)).ToList();
    }
}
