using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Finance;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Infrastructure.Finance;

/// <summary>
/// Implementação das projeções financeiras a partir dos snapshots imutáveis de <c>Booking</c>.
/// Toda agregação acontece aqui (servidor); os valores líquidos já refletem a taxa retida no split
/// (<c>NetToProviderCents</c> = bruto − fee da plataforma). Ver financial-split-spec.md §5.4 / §12.2.
/// </summary>
public sealed class FinanceReportService(IApplicationDbContext db) : IFinanceReportService
{
    private static readonly string[] PtMonths =
    {
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    };

    public async Task<StatementDto> GetStatementAsync(
        string userId, DateTime? from, DateTime? to, string? status, string? provider, int page, int pageSize,
        CancellationToken ct = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        // Só consultas com cobrança (preço > 0). Filtros server-side.
        // (o snapshot PriceCents só nasce ao iniciar o pagamento; antes disso vale o preço do tipo de consulta)
        var q = db.Bookings.AsNoTracking().Where(b => b.UserId == userId && (b.PriceCents > 0 || b.EventType.Price > 0));
        if (from is { } f) q = q.Where(b => b.StartTime >= f);
        if (to is { } t) q = q.Where(b => b.StartTime < t);
        if (Enum.TryParse<PaymentStatus>(status, true, out var st)) q = q.Where(b => b.PaymentStatus == st);
        if (Enum.TryParse<PaymentProvider>(provider, true, out var pr)) q = q.Where(b => b.PaymentProvider == pr);

        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(b => b.StartTime)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(b => new
            {
                b.Uid, b.StartTime, b.GuestName, Title = b.EventType.Title,
                Gross = b.PriceCents ?? b.EventType.Price ?? 0, Fee = b.PlatformFeeCents ?? 0, Net = b.NetToProviderCents,
                b.PaymentProvider, b.PaymentStatus,
            })
            .ToListAsync(ct);

        var items = rows.Select(r => new StatementItemDto(
            r.Uid, new DateTimeOffset(DateTime.SpecifyKind(r.StartTime, DateTimeKind.Utc)), r.GuestName, r.Title,
            r.Gross, r.Fee, r.Net ?? (r.Gross - r.Fee), r.PaymentProvider?.ToString(), r.PaymentStatus.ToString()))
            .ToList();
        return new StatementDto(items, page, pageSize, total);
    }

    public async Task<FinanceDashboardDto> GetIndividualSummaryAsync(string userId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var windowStart = monthStart.AddMonths(-11); // janela de 12 meses (inclui o mês corrente)

        var paid = await db.Bookings
            .Where(b => b.UserId == userId
                && b.PaymentStatus == PaymentStatus.PAID
                && b.PaidAt != null
                && b.PaidAt >= windowStart)
            .Select(b => new
            {
                PaidAt = b.PaidAt!.Value,
                Gross = b.PriceCents ?? 0,
                Net = b.NetToProviderCents ?? ((b.PriceCents ?? 0) - (b.PlatformFeeCents ?? 0)),
                b.GuestEmail,
            })
            .ToListAsync(ct);

        var period = $"{monthStart:yyyy-MM}";

        // Sem movimentação → série vazia + zeros (o front mostra empty state neutro).
        if (paid.Count == 0)
            return new FinanceDashboardDto(EmptySummary(period), Array.Empty<RevenuePointDto>());

        // Série de 12 meses (buckets zerados para meses sem pagamento — gráfico contínuo).
        var series = new List<RevenuePointDto>(12);
        for (var i = 0; i < 12; i++)
        {
            var m = windowStart.AddMonths(i);
            var monthRows = paid.Where(p => p.PaidAt.Year == m.Year && p.PaidAt.Month == m.Month).ToList();
            long gross = monthRows.Sum(p => (long)p.Gross);
            long net = monthRows.Sum(p => (long)p.Net);
            series.Add(new RevenuePointDto($"{m:yyyy-MM}", gross, net, 0));
        }

        long curGross = series[^1].GrossCents;
        long prevGross = series[^2].GrossCents;
        double growth = prevGross > 0
            ? Math.Round((curGross - prevGross) / (double)prevGross * 100, 1)
            : (curGross > 0 ? 100 : 0);

        long totalGross = paid.Sum(p => (long)p.Gross);
        long totalNet = paid.Sum(p => (long)p.Net);
        int totalCount = paid.Count;
        int distinctPatients = paid
            .Select(p => p.GuestEmail)
            .Where(e => !string.IsNullOrEmpty(e))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();
        int curMonthCount = paid.Count(p => p.PaidAt.Year == monthStart.Year && p.PaidAt.Month == monthStart.Month);

        var summary = new MetricsSummaryDto(
            Currency: "BRL",
            Period: period,
            MrrCents: curGross,
            ArrCents: curGross * 12,
            MrrGrowthPct: growth,
            ChurnRatePct: 0,
            LtvCents: distinctPatients > 0 ? totalNet / distinctPatients : 0,
            ArpuCents: totalCount > 0 ? totalGross / totalCount : 0,
            ActiveSubscriptions: distinctPatients,
            NewSubscriptions: curMonthCount,
            CanceledSubscriptions: 0);

        return new FinanceDashboardDto(summary, series);
    }

    public async Task<TeamFinanceReport> GetTeamSummaryAsync(string teamId, string callerUserId, CancellationToken ct = default)
    {
        // Acesso: apenas OWNER/ADMIN da clínica veem o consolidado (defesa em profundidade; Q6 refina).
        var callerRole = await db.TeamMembers
            .Where(m => m.TeamId == teamId && m.UserId == callerUserId)
            .Select(m => (TeamRole?)m.Role)
            .FirstOrDefaultAsync(ct);

        if (callerRole is not (TeamRole.OWNER or TeamRole.ADMIN))
            return new TeamFinanceReport(false, null);

        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);

        // Bookings pagos no mês corrente cujo EventType pertence à clínica.
        var rows = await db.Bookings
            .Where(b => b.PaymentStatus == PaymentStatus.PAID && b.PaidAt >= monthStart && b.PaidAt < monthEnd)
            .Join(
                db.EventTypes.Where(e => e.TeamId == teamId),
                b => b.EventTypeId,
                e => e.Id,
                (b, e) => new
                {
                    b.UserId,
                    Gross = b.PriceCents ?? 0,
                    Net = b.NetToProviderCents ?? ((b.PriceCents ?? 0) - (b.PlatformFeeCents ?? 0)),
                    Fee = b.PlatformFeeCents ?? 0,
                })
            .ToListAsync(ct);

        var members = await db.TeamMembers
            .Where(m => m.TeamId == teamId)
            .Join(db.Users, m => m.UserId, u => u.Id, (m, u) => new { m.UserId, u.Name, m.Role })
            .ToListAsync(ct);

        var byProfessional = rows
            .GroupBy(r => r.UserId)
            .Select(g =>
            {
                var mem = members.FirstOrDefault(m => m.UserId == g.Key);
                return new ProfessionalRevenueDto(
                    UserId: g.Key,
                    Name: mem?.Name,
                    Role: (mem?.Role ?? TeamRole.MEMBER).ToString(),
                    NetCents: g.Sum(x => (long)x.Net),
                    PaidBookingsCount: g.Count(),
                    ShareCents: null);
            })
            .OrderByDescending(p => p.NetCents)
            .ToList();

        long netTotal = rows.Sum(x => (long)x.Net);
        long fees = rows.Sum(x => (long)x.Fee);
        long gross = rows.Sum(x => (long)x.Gross);
        int count = rows.Count;

        var sub = await db.Subscriptions
            .Where(s => s.TeamId == teamId)
            .Select(s => new { s.PlanCode, s.Quantity, s.DefaultFeeBps })
            .FirstOrDefaultAsync(ct);

        var plan = new TeamPlanDto(
            PlanCode: (sub?.PlanCode ?? "CLINICA").ToUpperInvariant(),
            Quantity: sub?.Quantity ?? 1,
            DefaultFeeBps: sub?.DefaultFeeBps ?? 249);

        var summary = new TeamFinanceSummaryDto(
            TeamId: teamId,
            Currency: "BRL",
            Period: MonthLabelPt(monthStart),
            NetTotalCents: netTotal,
            PlatformFeesCents: fees,
            AvgTicketCents: count > 0 ? gross / count : 0,
            PaidBookingsCount: count,
            ByProfessional: byProfessional,
            Plan: plan);

        return new TeamFinanceReport(true, summary);
    }

    private static MetricsSummaryDto EmptySummary(string period) => new(
        "BRL", period, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    private static string MonthLabelPt(DateTime d) => $"{PtMonths[d.Month - 1]} de {d.Year}";
}
