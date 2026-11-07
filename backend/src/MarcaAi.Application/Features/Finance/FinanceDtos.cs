namespace MarcaAi.Application.Features.Finance;

/// <summary>
/// DTOs do Dashboard Financeiro (Fase 5 · spec §6). Espelham o contrato consumido pelo front
/// (`frontend/lib/api/finance-types.ts`). Todos os valores monetários em **centavos** (BRL).
/// A serialização JSON usa camelCase (padrão ASP.NET Core), casando com o front.
/// </summary>

// ─────────────────────────────────────────────────────────────────────────────
// Individual — GET /finance/summary (bookings pagos do profissional autenticado)
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>Métricas consolidadas do período (derivadas dos bookings PAID reais).</summary>
public sealed record MetricsSummaryDto(
    string Currency,
    string Period,
    long MrrCents,
    long ArrCents,
    double MrrGrowthPct,
    double ChurnRatePct,
    long LtvCents,
    long ArpuCents,
    int ActiveSubscriptions,
    int NewSubscriptions,
    int CanceledSubscriptions);

/// <summary>Ponto mensal da série de faturamento (bruto × líquido).</summary>
public sealed record RevenuePointDto(string Month, long GrossCents, long NetCents, long NewMrrCents);

/// <summary>Resposta agregada de `GET /finance/summary`. `RevenueSeries` vazia = sem movimentação.</summary>
public sealed record FinanceDashboardDto(
    MetricsSummaryDto Summary,
    IReadOnlyList<RevenuePointDto> RevenueSeries);

// ─────────────────────────────────────────────────────────────────────────────
// Clínica — GET /finance/teams/{teamId}/summary (consolidado da clínica)
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>Receita líquida gerada por um profissional da clínica no período.</summary>
public sealed record ProfessionalRevenueDto(
    string UserId,
    string? Name,
    string Role,
    long NetCents,
    int PaidBookingsCount,
    long? ShareCents);

/// <summary>Plano/fee vigente da clínica.</summary>
public sealed record TeamPlanDto(string PlanCode, int Quantity, int DefaultFeeBps);

/// <summary>Consolidado financeiro da clínica. `ByProfessional` vazia / count 0 = sem movimentação.</summary>
public sealed record TeamFinanceSummaryDto(
    string TeamId,
    string Currency,
    string Period,
    long NetTotalCents,
    long PlatformFeesCents,
    long AvgTicketCents,
    int PaidBookingsCount,
    IReadOnlyList<ProfessionalRevenueDto> ByProfessional,
    TeamPlanDto Plan);

/// <summary>
/// Resultado do consolidado da clínica com verificação de acesso. `Allowed=false` → o chamador
/// não é OWNER/ADMIN da clínica (o controller responde 403). Enforcement fino fica no Q6.
/// </summary>
public sealed record TeamFinanceReport(bool Allowed, TeamFinanceSummaryDto? Summary);

/// <summary>Linha do extrato (uma consulta com cobrança). Valores em centavos, calculados no servidor.</summary>
public sealed record StatementItemDto(
    string BookingUid, DateTimeOffset Date, string GuestName, string EventTypeTitle,
    int GrossCents, int PlatformFeeCents, int NetToProviderCents, string? Provider, string Status);

public sealed record StatementDto(IReadOnlyList<StatementItemDto> Items, int Page, int PageSize, int Total);
