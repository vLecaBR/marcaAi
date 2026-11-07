using System.Collections.Concurrent;

namespace MarcaAi.Application.Scheduling;

/// <summary>
/// Utilitários de tempo/fuso. Porte fiel de lib/scheduling/time-utils.ts (Next),
/// usando TimeZoneInfo com IDs IANA (ex.: "America/Sao_Paulo") — suportado no .NET 10.
/// Toda aritmética interna é em UTC.
/// </summary>
public static class TimeUtils
{
    private static readonly ConcurrentDictionary<string, TimeZoneInfo> Cache = new();
    public static TimeZoneInfo Zone(string id) => Cache.GetOrAdd(id, TimeZoneInfo.FindSystemTimeZoneById);

    private static DateTime AsUtc(DateTime d) => DateTime.SpecifyKind(d, DateTimeKind.Utc);

    /// <summary>Dado um "dia" (instante UTC) e "HH:mm" no fuso do owner, retorna o UTC correspondente.</summary>
    public static DateTime BuildUtcDateTime(DateTime dayUtc, string hhmm, string tzId)
    {
        var tz = Zone(tzId);
        var local = TimeZoneInfo.ConvertTimeFromUtc(AsUtc(dayUtc), tz);
        var parts = hhmm.Split(':');
        var h = int.Parse(parts[0]);
        var m = int.Parse(parts[1]);
        var localDt = new DateTime(local.Year, local.Month, local.Day, h, m, 0, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(localDt, tz);
    }

    /// <summary>Dia da semana (0=dom..6=sáb) de um instante UTC no contexto do fuso.</summary>
    public static int DayOfWeekInZone(DateTime utc, string tzId) =>
        (int)TimeZoneInfo.ConvertTimeFromUtc(AsUtc(utc), Zone(tzId)).DayOfWeek;

    /// <summary>Data local (no fuso) de um instante UTC.</summary>
    public static DateOnly LocalDate(DateTime utc, string tzId) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(AsUtc(utc), Zone(tzId)));

    /// <summary>Dias entre [from,to] representados como o instante UTC do meio-dia local (evita DST).</summary>
    public static IReadOnlyList<DateTime> EachDayBetween(DateTime fromUtc, DateTime toUtc, string tzId)
    {
        var tz = Zone(tzId);
        var fromLocal = TimeZoneInfo.ConvertTimeFromUtc(AsUtc(fromUtc), tz);
        var toLocal = TimeZoneInfo.ConvertTimeFromUtc(AsUtc(toUtc), tz);
        var cur = new DateTime(fromLocal.Year, fromLocal.Month, fromLocal.Day, 12, 0, 0, DateTimeKind.Unspecified);
        var end = new DateTime(toLocal.Year, toLocal.Month, toLocal.Day, 12, 0, 0, DateTimeKind.Unspecified);
        var days = new List<DateTime>();
        while (cur <= end)
        {
            days.Add(TimeZoneInfo.ConvertTimeToUtc(cur, tz));
            cur = cur.AddDays(1);
        }
        return days;
    }

    public static bool RangesOverlap(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd) =>
        aStart < bEnd && aEnd > bStart;

    /// <summary>Subtrai intervalos ocupados de uma janela, retornando os fragmentos livres.</summary>
    public static List<TimeRange> SubtractBusyFromWindow(TimeRange window, IEnumerable<TimeRange> busy, int gridMinutes = 30)
    {
        var sorted = busy
            .Where(b => RangesOverlap(window.Start, window.End, b.Start, b.End))
            .OrderBy(b => b.Start)
            .ToList();

        var free = new List<TimeRange>();
        var cursor = window.Start;

        foreach (var block in sorted)
        {
            if (cursor < block.Start) free.Add(new TimeRange(cursor, block.Start));
            if (block.End > cursor)
            {
                // Alinhamento à grade (padrão 30 min; ver GridMinutesFor para durações que não são múltiplas de 30).
                var aligned = AlignUp(block.End, TimeSpan.FromMinutes(gridMinutes));
                cursor = block.End > aligned ? block.End : aligned;
            }
        }

        if (cursor < window.End) free.Add(new TimeRange(cursor, window.End));
        return free;
    }

    /// <summary>
    /// Passo da grade de horários conforme a duração da consulta: 30 min quando a duração é múltipla
    /// de 30; 15 min quando é múltipla de 15 (ex.: 45); senão 5 min (ex.: 50). Evita horários "quebrados".
    /// </summary>
    public static int GridMinutesFor(int durationMin) =>
        durationMin % 30 == 0 ? 30 : durationMin % 15 == 0 ? 15 : 5;

    private static DateTime AlignUp(DateTime dt, TimeSpan interval)
    {
        var itv = interval.Ticks;
        var aligned = ((dt.Ticks + itv - 1) / itv) * itv;
        return new DateTime(aligned, dt.Kind);
    }

    /// <summary>Gera slots de N minutos dentro de um fragmento livre, respeitando buffers.</summary>
    public static List<TimeRange> GenerateSlotsInWindow(TimeRange free, int durationMin, int beforeBuf, int afterBuf)
    {
        var slots = new List<TimeRange>();
        var total = beforeBuf + durationMin + afterBuf;
        var cursor = free.Start;

        while (true)
        {
            var slotEnd = cursor.AddMinutes(total);
            if (slotEnd > free.End) break;

            var actualStart = cursor.AddMinutes(beforeBuf);
            var actualEnd = actualStart.AddMinutes(durationMin);
            slots.Add(new TimeRange(actualStart, actualEnd));

            cursor = cursor.AddMinutes(durationMin + afterBuf);
        }
        return slots;
    }

    /// <summary>Formata um instante UTC como "yyyy-MM-dd" no fuso do viewer.</summary>
    public static string FormatDateInZone(DateTime utc, string tzId) =>
        TimeZoneInfo.ConvertTimeFromUtc(AsUtc(utc), Zone(tzId)).ToString("yyyy-MM-dd");
}
