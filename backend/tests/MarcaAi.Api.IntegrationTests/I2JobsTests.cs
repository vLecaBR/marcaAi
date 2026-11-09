using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Hangfire;
using MarcaAi.Api.Config;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I2: resiliência dos jobs (retries, sem sobreposição) e visibilidade no /admin.</summary>
[Collection("api")]
public class I2JobsTests(ApiFixture api)
{
    [Fact]
    public async Task Filtros_globais_tem_5_tentativas_com_espera_crescente_e_nao_duplicam_com_varios_hosts()
    {
        await using var outroHost = api.WithWebHostBuilder(_ => { }); // 2º host no mesmo processo: Apply() roda de novo
        _ = outroHost.Services;

        var retries = GlobalJobFilters.Filters.Select(f => f.Instance).OfType<AutomaticRetryAttribute>().ToList();
        var retry = Assert.Single(retries);
        Assert.Equal(5, retry.Attempts);
        Assert.Equal(AttemptsExceededAction.Fail, retry.OnAttemptsExceeded);
        Assert.Equal(HangfireResilience.DelaysInSeconds, retry.DelaysInSeconds);
        for (var i = 1; i < retry.DelaysInSeconds.Length; i++) Assert.True(retry.DelaysInSeconds[i] > retry.DelaysInSeconds[i - 1]);

        Assert.Single(GlobalJobFilters.Filters.Select(f => f.Instance).OfType<DisableConcurrentExecutionAttribute>());
    }

    [Fact]
    public async Task Admin_mostra_jobs_recorrentes_sem_vazar_mensagem_de_erro()
    {
        var dono = await api.LoginAsync("i2-jobs-dono@example.test");
        await dono.OnboardAsync("i2-jobs-dono");
        await using var f = api.WithWebHostBuilder(b =>
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Admin:UserIds"] = dono.Id })));
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/overview");
        req.Headers.Add("Cookie", dono.Cookies);
        var resp = await f.CreateClient().SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var jobs = (await resp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobs");
        Assert.True(jobs.GetProperty("available").GetBoolean());
        Assert.True(jobs.GetProperty("servers").GetInt32() >= 1);
        var ids = jobs.GetProperty("recurring").EnumerateArray().Select(r => r.GetProperty("id").GetString()).ToList();
        Assert.Contains("consultas-reminders", ids);
        Assert.Contains("reservas-sem-pagamento", ids);
        Assert.Contains("retencao-lgpd", ids);
        // As falhas recentes só trazem nome do job e tipo do erro (nunca a mensagem).
        foreach (var fail in jobs.GetProperty("recentFailures").EnumerateArray())
            Assert.False(fail.TryGetProperty("message", out _) || fail.TryGetProperty("exceptionMessage", out _));
    }
}
