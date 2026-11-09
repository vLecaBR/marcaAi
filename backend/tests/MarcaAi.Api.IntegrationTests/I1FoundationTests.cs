using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Hangfire;
using Hangfire.Storage;
using MarcaAi.Api.Config;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Console;
using Npgsql;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I1: saúde do serviço (live/ready), log estruturado sem dado pessoal e modelo do EF alinhado às migrations.</summary>
[Collection("api")]
public class I1FoundationTests(ApiFixture api)
{
    [Fact]
    public async Task Live_responde_200_sem_tocar_no_banco()
    {
        var r = await api.NewClient().GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task Health_legado_continua_200()
    {
        var r = await api.NewClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task Ready_fica_200_com_banco_migrations_e_hangfire_vivos()
    {
        // O servidor do Hangfire registra o batimento logo após o boot: dá até 30 s.
        var client = api.NewClient();
        HttpResponseMessage? r = null;
        for (var i = 0; i < 30; i++)
        {
            r = await client.GetAsync("/health/ready");
            if (r.StatusCode == HttpStatusCode.OK) break;
            await Task.Delay(1000);
        }
        Assert.Equal(HttpStatusCode.OK, r!.StatusCode);
        Assert.Equal("Healthy", await r.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Check_do_banco_e_unhealthy_quando_o_postgres_nao_responde()
    {
        var opts = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=x;Username=x;Password=x;Timeout=2;Command Timeout=2").Options;
        await using var db = new ApplicationDbContext(opts);
        var result = await new DatabaseReadyCheck(db, NullLogger<DatabaseReadyCheck>.Instance)
            .CheckHealthAsync(new HealthCheckContext());
        Assert.Equal(HealthStatus.Unhealthy, result.Status);
        Assert.Equal("banco indisponível", result.Description); // sem detalhe da exceção
    }

    [Fact]
    public async Task Check_dos_jobs_e_unhealthy_quando_o_storage_falha()
    {
        var result = await new HangfireReadyCheck(new BrokenStorage(), NullLogger<HangfireReadyCheck>.Instance)
            .CheckHealthAsync(new HealthCheckContext());
        Assert.Equal(HealthStatus.Unhealthy, result.Status);
    }

    private sealed class BrokenStorage : JobStorage
    {
        public override IMonitoringApi GetMonitoringApi() => throw new InvalidOperationException("storage fora");
        public override IStorageConnection GetConnection() => throw new InvalidOperationException("storage fora");
    }

    [Fact]
    public async Task ProblemDetails_traz_traceId_no_formato_do_log()
    {
        var r = await api.NewClient().GetAsync("/api/v1/me/profile"); // sem sessão → 401 com ProblemDetails
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        var body = JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;
        Assert.Matches("^[0-9a-f]{32}$", body.GetProperty("traceId").GetString()!);
    }

    [Fact]
    public async Task Modelo_do_EF_nao_tem_mudancas_pendentes_de_migration()
    {
        var pending = await api.WithDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges()));
        Assert.False(pending, "O modelo mudou sem migration: rode `dotnet ef migrations add`.");
    }

    // ── Formatter de log ────────────────────────────────────────────────────
    private static string Format(Exception? ex, string message = "olá")
    {
        var sw = new StringWriter();
        var entry = new LogEntry<string>(LogLevel.Error, "Cat", new EventId(0), message, ex, (s, _) => s);
        new JsonLogFormatter().Write(in entry, new LoggerExternalScopeProvider(), sw);
        return sw.ToString().Trim();
    }

    [Fact]
    public void Log_json_tem_uma_linha_valida_com_nivel_e_traceId()
    {
        using var act = new System.Diagnostics.Activity("t").Start();
        var line = Format(null);
        var j = JsonDocument.Parse(line).RootElement;
        Assert.Equal("Error", j.GetProperty("level").GetString());
        Assert.Equal("olá", j.GetProperty("message").GetString());
        Assert.Equal(act.TraceId.ToString(), j.GetProperty("traceId").GetString());
        Assert.DoesNotContain('\n', line);
    }

    [Fact]
    public void Log_json_de_erro_do_postgres_nao_vaza_o_Detail_com_valores()
    {
        var pg = new PostgresException("duplicate key value", "ERROR", "ERROR", "23505", detail: "Key (email)=(paciente@exemplo.com) already exists.");
        var line = Format(pg);
        Assert.DoesNotContain("paciente@exemplo.com", line);
        Assert.Contains("PostgresException", line);
    }

    [Fact]
    public void ToString_do_PostgresException_vaza_o_Detail_por_isso_o_formatter_nao_o_usa()
    {
        // Documenta o motivo da regra: se este teste quebrar (Npgsql mudou), a regra pode ser revista.
        var pg = new PostgresException("dup", "ERROR", "ERROR", "23505", detail: "Key (email)=(x@y.com)");
        Assert.Contains("x@y.com", pg.ToString());
    }
}
