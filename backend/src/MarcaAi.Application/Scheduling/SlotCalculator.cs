namespace MarcaAi.Application.Scheduling;

/// <summary>
/// Gera slots disponíveis a partir das janelas e dos agendamentos existentes.
/// Porte fiel de lib/scheduling/slots.ts. Função pura.
/// </summary>
public static class SlotCalculator
{
    public static List<Slot> ComputeAvailableSlots(
        IReadOnlyList<DayAvailability> windows,
        IReadOnlyList<BookingConflict> existingBookings,
        SlotInput input)
    {
        var now = DateTime.UtcNow;
        var slots = new List<Slot>();

        DateTime? maxDate = input.BookingLimitDays is int lim
            ? DateTime.SpecifyKind(now.Date, DateTimeKind.Utc).AddDays(lim)
            : null;

        foreach (var day in windows)
        {
            if (maxDate is { } md && day.Date > md) continue;

            foreach (var window in day.Windows)
            {
                var windowBusy = existingBookings
                    .Where(b =>
                    {
                        var bufStart = b.StartTime.AddMinutes(-input.BeforeBuffer);
                        var bufEnd = b.EndTime.AddMinutes(input.AfterBuffer);
                        return bufStart < window.End && bufEnd > window.Start;
                    })
                    .Select(b => new TimeRange(
                        b.StartTime.AddMinutes(-input.BeforeBuffer),
                        b.EndTime.AddMinutes(input.AfterBuffer)))
                    .ToList();

                var freeFragments = TimeUtils.SubtractBusyFromWindow(window, windowBusy, TimeUtils.GridMinutesFor(input.EventDuration));

                foreach (var fragment in freeFragments)
                {
                    var raw = TimeUtils.GenerateSlotsInWindow(
                        fragment, input.EventDuration, input.BeforeBuffer, input.AfterBuffer);

                    foreach (var s in raw)
                    {
                        if (s.Start <= now) continue; // slot no passado
                        slots.Add(new Slot(s.Start, s.End));
                    }
                }
            }
        }

        return slots;
    }

    public static Dictionary<string, List<Slot>> GroupByDate(IEnumerable<Slot> slots, string viewerTimeZone)
    {
        var grouped = new Dictionary<string, List<Slot>>();
        foreach (var slot in slots)
        {
            var key = TimeUtils.FormatDateInZone(slot.StartUtc, viewerTimeZone);
            if (!grouped.TryGetValue(key, out var list))
            {
                list = new List<Slot>();
                grouped[key] = list;
            }
            list.Add(slot);
        }
        return grouped;
    }
}
