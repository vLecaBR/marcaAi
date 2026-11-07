using System.Data;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;

namespace MarcaAi.Infrastructure.Persistence.Concurrency;

/// <summary>
/// Implementação da trava pessimista anti double-booking.
///
/// Estratégia acordada: nível de isolamento PADRÃO (Read Committed) + bloqueio de linha
/// via SELECT ... FOR UPDATE SKIP LOCKED. Deve rodar DENTRO de uma transação aberta pelo
/// caso de uso, e ANTES do INSERT do agendamento. SKIP LOCKED evita espera: se outra
/// transação já travou a linha concorrente, ela é ignorada aqui e o INSERT do concorrente
/// falhará/serializará no fluxo dele.
///
/// Observação: SQL parametrizado (sem interpolação de strings) — sem risco de injeção.
/// </summary>
public sealed class BookingConcurrencyGuard(ApplicationDbContext db) : IBookingConcurrencyGuard
{
    private const string Sql = """
        SELECT id FROM bookings
        WHERE "userId" = @ownerId
          AND status IN ('CONFIRMED', 'PENDING')
          AND "startTime" < @endUtc
          AND "endTime"   > @startUtc
        FOR UPDATE SKIP LOCKED
        """;

    public async Task<bool> HasConflictAsync(
        string ownerId,
        DateTime startUtc,
        DateTime endUtc,
        CancellationToken cancellationToken = default)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
            await connection.OpenAsync(cancellationToken);

        // Enlista na transação atual do DbContext (obrigatório p/ o lock valer).
        var npgTx = db.Database.CurrentTransaction?.GetDbTransaction() as NpgsqlTransaction;

        // 1) Advisory lock de transação POR PROFISSIONAL. O FOR UPDATE abaixo só trava linhas que já existem:
        //    com o horário livre não há linha a travar, e duas requisições simultâneas passavam juntas pela
        //    checagem e inseriam as duas (double-booking). O lock serializa a criação de consultas do mesmo
        //    profissional; é liberado sozinho no COMMIT/ROLLBACK, e a checagem seguinte enxerga o que o
        //    concorrente acabou de gravar (Read Committed). Regressão coberta em Api.IntegrationTests.
        await using (var lockCmd = connection.CreateCommand())
        {
            lockCmd.CommandText = "SELECT pg_advisory_xact_lock(hashtextextended(@ownerId, 0))";
            lockCmd.Transaction = npgTx;
            lockCmd.Parameters.Add(new NpgsqlParameter("ownerId", NpgsqlDbType.Text) { Value = ownerId });
            await lockCmd.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = Sql;
        cmd.Transaction = npgTx;

        cmd.Parameters.Add(new NpgsqlParameter("ownerId", NpgsqlDbType.Text) { Value = ownerId });
        cmd.Parameters.Add(new NpgsqlParameter("startUtc", NpgsqlDbType.TimestampTz) { Value = startUtc });
        cmd.Parameters.Add(new NpgsqlParameter("endUtc", NpgsqlDbType.TimestampTz) { Value = endUtc });

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken); // true = existe conflito
    }
}
