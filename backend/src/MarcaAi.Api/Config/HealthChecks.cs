using Hangfire;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace MarcaAi.Api.Config;

/// <summary>
/// Prontidão do banco: responde, e não há migrations pendentes (o boot aplica, mas um schema defasado derruba tudo).
/// A mensagem devolvida nunca carrega detalhe da exceção (a rota é pública atrás do túnel).
/// </summary>
public sealed class DatabaseReadyCheck(ApplicationDbContext db, ILogger<DatabaseReadyCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            if (!await db.Database.CanConnectAsync(timeout.Token)) return HealthCheckResult.Unhealthy("banco indisponível");
            var pending = await db.Database.GetPendingMigrationsAsync(timeout.Token);
            return pending.Any() ? HealthCheckResult.Unhealthy("migrations pendentes") : HealthCheckResult.Healthy();
        }
        catch (Exception ex)
        {
            logger.LogWarning("[Health] Banco não respondeu ({Type}).", ex.GetType().Name);
            return HealthCheckResult.Unhealthy("banco indisponível");
        }
    }
}

/// <summary>Prontidão dos jobs: pelo menos um servidor Hangfire registrado e com batimento recente.</summary>
public sealed class HangfireReadyCheck(JobStorage storage, ILogger<HangfireReadyCheck> logger) : IHealthCheck
{
    public static readonly TimeSpan MaxHeartbeatAge = TimeSpan.FromMinutes(2);

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            var servers = storage.GetMonitoringApi().Servers();
            var alive = servers.Any(s => s.Heartbeat is { } hb && DateTime.UtcNow - hb < MaxHeartbeatAge);
            return Task.FromResult(alive ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("jobs parados"));
        }
        catch (Exception ex)
        {
            logger.LogWarning("[Health] Hangfire não respondeu ({Type}).", ex.GetType().Name);
            return Task.FromResult(HealthCheckResult.Unhealthy("jobs parados"));
        }
    }
}
