using System.Globalization;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Availability;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace MarcaAi.Api.Controllers;

[ApiController]
[Route("api/v1/slots")]
public sealed class SlotsController(IAvailabilityService availability, IReadCache cache) : ControllerBase
{
    /// <summary>
    /// Horários disponíveis (público) de um profissional para um tipo de consulta numa data.
    /// Ex.: GET /api/v1/slots?ownerId=..&eventTypeId=..&date=2026-08-03&tz=America/Sao_Paulo
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("slots")]
    [HttpGet]
    public async Task<ActionResult<SlotsResult>> Get(
        [FromQuery] string ownerId,
        [FromQuery] string eventTypeId,
        [FromQuery] string date,
        [FromQuery] string tz,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ownerId) || string.IsNullOrWhiteSpace(eventTypeId) ||
            string.IsNullOrWhiteSpace(date))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Parâmetros inválidos.");

        if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Data inválida (use yyyy-MM-dd).");

        var viewerTz = string.IsNullOrWhiteSpace(tz) ? "UTC" : tz;

        var result = await availability.GetSlotsForDateAsync(ownerId, eventTypeId, parsedDate, viewerTz, ct);
        return result is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, detail: "Evento ou agenda não encontrados.")
            : Ok(result);
    }

    /// <summary>
    /// Dias do mês (yyyy-MM) que têm pelo menos um horário livre — o calendário público só habilita esses dias.
    /// Ex.: GET /api/v1/slots/month?ownerId=..&amp;eventTypeId=..&amp;month=2026-11&amp;tz=America/Sao_Paulo
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("slots")]
    [HttpGet("month")]
    public async Task<IActionResult> Month(
        [FromQuery] string ownerId, [FromQuery] string eventTypeId, [FromQuery] string month, [FromQuery] string tz,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ownerId) || string.IsNullOrWhiteSpace(eventTypeId) ||
            !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first))
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Parâmetros inválidos (month = yyyy-MM).");

        var viewerTz = string.IsNullOrWhiteSpace(tz) ? "UTC" : tz;
        // 30 s de cache por (profissional, tipo, mês, fuso). Consulta/agenda/exceção do profissional invalidam na hora; o TTL curto
        // cobre o que o cache não enxerga (agenda do Google). O dia clicado sempre consulta os horários reais.
        var days = await cache.GetOrCreateAsync<IReadOnlyList<string>?>("slots-month", ownerId, $"{eventTypeId}|{month}|{viewerTz}", TimeSpan.FromSeconds(30),
            () => availability.GetAvailableDaysAsync(ownerId, eventTypeId, first, viewerTz, ct), // null (evento/agenda inexistente) não é guardado
            shouldCache: v => v is not null);
        if (days is null) return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Evento ou agenda não encontrados.");
        return Ok(new { days });
    }
}
