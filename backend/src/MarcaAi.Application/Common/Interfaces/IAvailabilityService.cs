using MarcaAi.Application.Features.Availability;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Disponibilidade pública: slots de um profissional para um tipo de consulta.</summary>
public interface IAvailabilityService
{
    /// <summary>Retorna os slots disponíveis para a data (no fuso do viewer). Null se evento/agenda inexistente.</summary>
    Task<SlotsResult?> GetSlotsForDateAsync(
        string ownerId, string eventTypeId, DateOnly date, string viewerTimeZone,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Dias (yyyy-MM-dd, no fuso do viewer) do mês que têm ao menos um horário livre. Mesmo cálculo de <see cref="GetSlotsForDateAsync"/>,
    /// mas carrega agenda, consultas e horários do Google UMA vez para o mês. Null se evento/agenda inexistente.
    /// </summary>
    Task<IReadOnlyList<string>?> GetAvailableDaysAsync(
        string ownerId, string eventTypeId, DateOnly firstDayOfMonth, string viewerTimeZone,
        CancellationToken cancellationToken = default);
}
