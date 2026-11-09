namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Job recorrente (Hangfire): entrega as mensagens do outbox vencidas, com espera crescente entre tentativas.</summary>
public interface IOutboxDrainJob
{
    Task RunAsync(CancellationToken cancellationToken = default);
}
