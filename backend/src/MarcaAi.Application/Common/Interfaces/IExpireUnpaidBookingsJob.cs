namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Job recorrente que cancela (SYSTEM) as reservas pagas online cujo prazo para pagar venceu, liberando o horário.</summary>
public interface IExpireUnpaidBookingsJob
{
    /// <returns>Quantas reservas foram expiradas.</returns>
    Task<int> RunAsync(CancellationToken cancellationToken = default);
}
