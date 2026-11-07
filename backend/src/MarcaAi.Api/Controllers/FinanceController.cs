using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Leitura financeira (Fase 5 · spec §6). Projeta os snapshots imutáveis de <c>Booking</c> em
/// métricas de negócio (individual) e no consolidado da clínica. Só leitura; nada é recalculado
/// a posteriori. A agregação é sempre do servidor.
/// </summary>
[ApiController]
[Route("api/v1/finance")]
[Authorize]
public sealed class FinanceController(IFinanceReportService finance) : ControllerBase
{
    /// <summary>Resumo financeiro do profissional autenticado (série de faturamento + métricas).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<FinanceDashboardDto>> Summary(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var dashboard = await finance.GetIndividualSummaryAsync(userId, ct);
        return Ok(dashboard);
    }

    /// <summary>Extrato por consulta do profissional (período, status e provedor opcionais; paginado).</summary>
    [HttpGet("statement")]
    public async Task<ActionResult<StatementDto>> Statement(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? status, [FromQuery] string? provider,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        return Ok(await finance.GetStatementAsync(userId, from?.ToUniversalTime(), to?.ToUniversalTime(), status, provider, page, pageSize, ct));
    }

    /// <summary>Consolidado financeiro da clínica (OWNER/ADMIN). 403 se o chamador não tiver acesso.</summary>
    [HttpGet("teams/{teamId}/summary")]
    public async Task<ActionResult<TeamFinanceSummaryDto>> TeamSummary(string teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var report = await finance.GetTeamSummaryAsync(teamId, userId, ct);
        if (!report.Allowed)
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "Sem acesso ao financeiro desta clínica.");

        return Ok(report.Summary);
    }
}
