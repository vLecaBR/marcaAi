using MarcaAi.Application.Features.Finance;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Projeções de leitura financeira a partir dos snapshots imutáveis de <c>Booking</c>
/// (PriceCents / PlatformFeeCents / NetToProviderCents / PaidAt). O front nunca soma centavos —
/// a agregação é sempre do servidor (spec §6.3). Ver financial-split-spec.md §12.2.
/// </summary>
public interface IFinanceReportService
{
    /// <summary>
    /// Resumo financeiro do profissional autenticado: série mensal de faturamento (bruto/líquido)
    /// dos últimos 12 meses + métricas do mês corrente. Sem bookings pagos → série vazia e zeros.
    /// </summary>
    Task<FinanceDashboardDto> GetIndividualSummaryAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>Extrato por consulta do profissional, paginado e filtrável (período, status de pagamento, provedor).</summary>
    Task<StatementDto> GetStatementAsync(
        string userId, DateTime? from, DateTime? to, string? status, string? provider, int page, int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Consolidado da clínica no mês corrente (líquido total, taxas retidas, ticket médio, receita
    /// por profissional). Verifica que o chamador é OWNER/ADMIN da clínica (senão <c>Allowed=false</c>).
    /// </summary>
    Task<TeamFinanceReport> GetTeamSummaryAsync(string teamId, string callerUserId, CancellationToken cancellationToken = default);
}
