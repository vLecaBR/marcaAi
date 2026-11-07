namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Trava pessimista anti double-booking. Deve ser executada DENTRO de uma transação
/// (Read Committed) e ANTES do INSERT do agendamento.
/// Implementa o padrão SELECT ... FOR UPDATE SKIP LOCKED.
/// </summary>
public interface IBookingConcurrencyGuard
{
    /// <summary>
    /// Retorna true se houver conflito de horário (overlap) para o profissional.
    /// Considera apenas consultas CONFIRMED/PENDING. Bloqueia as linhas concorrentes
    /// pulando as já travadas (SKIP LOCKED) para evitar espera.
    /// </summary>
    Task<bool> HasConflictAsync(
        string ownerId,
        DateTime startUtc,
        DateTime endUtc,
        CancellationToken cancellationToken = default,
        string? ignoreBookingId = null);
}
