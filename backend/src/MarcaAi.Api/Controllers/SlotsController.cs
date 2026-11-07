using System.Globalization;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Availability;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace MarcaAi.Api.Controllers;

[ApiController]
[Route("api/v1/slots")]
public sealed class SlotsController(IAvailabilityService availability) : ControllerBase
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
}
