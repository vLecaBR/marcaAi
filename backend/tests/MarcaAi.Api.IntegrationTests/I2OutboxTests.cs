using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Infrastructure.Jobs;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>E-mail que pode ser "derrubado" e religado, para provar a entrega posterior.</summary>
public sealed class FlakyEmailClient : IEmailClient
{
    public volatile bool Down;
    public List<(string To, string Subject)> Sent { get; } = new();
    public Task SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        if (Down) throw new HttpRequestException($"provedor fora do ar para {to}"); // o texto inclui o e-mail de propósito: o LastError tem de mascará-lo
        lock (Sent) Sent.Add((to, subject));
        return Task.CompletedTask;
    }
    public int Count(string to, string subjectStart) { lock (Sent) return Sent.Count(e => e.To == to && e.Subject.StartsWith(subjectStart)); }
}

/// <summary>I2: outbox de notificações — nada se perde, nada duplica, nada sai depois de a consulta ser cancelada.</summary>
[Collection("api")]
public class I2OutboxTests(ApiFixture api)
{
    private static DateTime ProximoDiaUtil(int dias)
    {
        var d = DateTime.UtcNow.Date.AddDays(dias);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    private WebApplicationFactory<Program> ComEmail(FlakyEmailClient email, int? maxAttempts = null) =>
        api.WithWebHostBuilder(b =>
        {
            b.ConfigureTestServices(s => { s.RemoveAll<IEmailClient>(); s.AddSingleton<IEmailClient>(email); });
            if (maxAttempts is { } m) b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Outbox:MaxAttempts"] = m.ToString() }));
        });

    /// <summary>Profissional novo + uma consulta criada pelo host <paramref name="f"/> (assim o envio usa o e-mail do teste).</summary>
    private async Task<(string Uid, string Owner)> CriaConsultaAsync(WebApplicationFactory<Program> f, string slug, string guestEmail, int dia = 5)
    {
        var pro = await api.LoginAsync($"{slug}@example.test");
        var (owner, evt, _) = await pro.OnboardAsync(slug);
        var slots = (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={ProximoDiaUtil(dia):yyyy-MM-dd}&tz=America/Sao_Paulo")).GetProperty("slots").EnumerateArray().ToArray();
        var http = f.CreateClient();
        var r = await http.PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = owner, eventTypeId = evt, guestName = "Paciente Outbox", guestEmail,
            startTimeUtc = slots[0].GetProperty("startUtc").GetString(), endTimeUtc = slots[0].GetProperty("endUtc").GetString(),
            guestTimeZone = "America/Sao_Paulo", consentAccepted = true,
        });
        r.EnsureSuccessStatusCode();
        return ((await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!, owner);
    }

    private static async Task RodaJobAsync(WebApplicationFactory<Program> f)
    {
        using var scope = f.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IOutboxDrainJob>().RunAsync();
    }

    private Task<List<OutboxMessage>> LinhasAsync(string uid) =>
        api.WithDbAsync(db => db.OutboxMessages.AsNoTracking().Where(m => m.BookingUid == uid).OrderBy(m => m.Kind).ThenBy(m => m.Channel).ToListAsync());

    /// <summary>Faz as mensagens pendentes vencerem agora (em vez de esperar a espera exponencial).</summary>
    private Task VenceTudoAsync(string uid) =>
        api.WithDbAsync(db => db.OutboxMessages.Where(m => m.BookingUid == uid && m.Status == OutboxStatus.PENDING)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.NextAttemptAt, DateTime.UtcNow.AddSeconds(-1))));

    [Fact]
    public async Task Email_que_falha_e_reenviado_depois_e_chega_uma_vez_so()
    {
        var email = new FlakyEmailClient { Down = true };
        await using var f = ComEmail(email);
        var (uid, _) = await CriaConsultaAsync(f, "i2-retry", "outbox-retry@example.test");

        // Provedor fora: a consulta existe, nenhum e-mail saiu e as mensagens estão na fila com 1 tentativa.
        var antes = await LinhasAsync(uid);
        Assert.NotEmpty(antes);
        Assert.All(antes, m => { Assert.Equal(OutboxStatus.PENDING, m.Status); Assert.Equal(1, m.Attempts); });
        Assert.Empty(email.Sent);
        // O erro guardado não leva o e-mail do paciente.
        Assert.All(antes, m => Assert.DoesNotContain("outbox-retry@example.test", m.LastError));

        // Ainda dentro da espera: o job não mexe.
        await RodaJobAsync(f);
        Assert.Empty(email.Sent);

        // Provedor volta e a espera vence: entrega.
        email.Down = false;
        await VenceTudoAsync(uid);
        await RodaJobAsync(f);
        Assert.Equal(1, email.Count("outbox-retry@example.test", "Consulta confirmada"));

        // Rodar de novo não duplica; as linhas viram só metadado.
        await RodaJobAsync(f);
        Assert.Equal(1, email.Count("outbox-retry@example.test", "Consulta confirmada"));
        var depois = await LinhasAsync(uid);
        Assert.All(depois, m =>
        {
            Assert.Equal(OutboxStatus.SENT, m.Status);
            Assert.Equal("", m.Recipient); Assert.Equal("", m.Subject); Assert.Equal("", m.Body);
        });
    }

    [Fact]
    public async Task Entrega_imediata_quando_o_provedor_esta_de_pe()
    {
        var email = new FlakyEmailClient();
        await using var f = ComEmail(email);
        var (uid, _) = await CriaConsultaAsync(f, "i2-ok", "outbox-ok@example.test");
        Assert.Equal(1, email.Count("outbox-ok@example.test", "Consulta confirmada"));
        Assert.All(await LinhasAsync(uid), m => Assert.Equal(OutboxStatus.SENT, m.Status));
    }

    [Fact]
    public async Task Consulta_cancelada_antes_do_envio_nao_recebe_a_confirmacao_so_o_cancelamento()
    {
        var email = new FlakyEmailClient { Down = true };
        await using var f = ComEmail(email);
        var (uid, _) = await CriaConsultaAsync(f, "i2-cancel", "outbox-cancel@example.test");
        (await f.CreateClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/cancel", new { reason = "mudei de ideia" })).EnsureSuccessStatusCode();

        email.Down = false;
        await VenceTudoAsync(uid);
        await RodaJobAsync(f);

        Assert.Equal(0, email.Count("outbox-cancel@example.test", "Consulta confirmada"));
        Assert.Equal(1, email.Count("outbox-cancel@example.test", "Consulta cancelada"));
        var linhas = await LinhasAsync(uid);
        Assert.All(linhas.Where(m => m.Kind != "booking.cancelled"), m => Assert.Equal(OutboxStatus.SKIPPED, m.Status));
        Assert.All(linhas.Where(m => m.Kind == "booking.cancelled"), m => Assert.Equal(OutboxStatus.SENT, m.Status));
    }

    [Fact]
    public async Task Esgotadas_as_tentativas_a_mensagem_vira_morta_com_o_conteudo_guardado()
    {
        var email = new FlakyEmailClient { Down = true };
        await using var f = ComEmail(email, maxAttempts: 2);
        var (uid, _) = await CriaConsultaAsync(f, "i2-dead", "outbox-dead@example.test");

        await VenceTudoAsync(uid);
        await RodaJobAsync(f); // 2ª tentativa = a última

        var linhas = await LinhasAsync(uid);
        Assert.NotEmpty(linhas);
        Assert.All(linhas, m =>
        {
            Assert.Equal(OutboxStatus.DEAD, m.Status);
            Assert.Equal(2, m.Attempts);
            Assert.NotEqual("", m.Body); // conteúdo guardado para reenvio manual
            Assert.DoesNotContain("@example.test", m.LastError); // e-mail mascarado
        });
    }

    [Fact]
    public async Task Painel_do_dono_mostra_mortas_sem_dado_pessoal_e_permite_reenfileirar()
    {
        var dono = await api.LoginAsync("i2-dono@example.test");
        await dono.OnboardAsync("i2-dono");
        var email = new FlakyEmailClient { Down = true };
        await using var f = api.WithWebHostBuilder(b =>
        {
            b.ConfigureTestServices(s => { s.RemoveAll<IEmailClient>(); s.AddSingleton<IEmailClient>(email); });
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Outbox:MaxAttempts"] = "1", ["Admin:UserIds"] = dono.Id }));
        });
        var (uid, _) = await CriaConsultaAsync(f, "i2-admin", "outbox-admin@example.test");
        Assert.All(await LinhasAsync(uid), m => Assert.Equal(OutboxStatus.DEAD, m.Status)); // MaxAttempts=1: a 1ª falha já mata

        HttpRequestMessage Req(HttpMethod m, string path) { var r = new HttpRequestMessage(m, path); r.Headers.Add("Cookie", dono.Cookies); return r; }
        var http = f.CreateClient();
        var resp = await http.SendAsync(Req(HttpMethod.Get, "/api/v1/admin/overview"));
        var body = await resp.Content.ReadAsStringAsync();
        var j = JsonDocument.Parse(body).RootElement.GetProperty("outbox");
        Assert.True(j.GetProperty("dead").GetInt32() >= 2);
        Assert.DoesNotContain("outbox-admin@example.test", body);
        var id = j.GetProperty("deadRecent").EnumerateArray().First().GetProperty("id").GetString()!;

        // Usuário comum não reenfileira (404).
        var comum = await api.LoginAsync("i2-comum@example.test");
        Assert.Equal(HttpStatusCode.NotFound, (await comum.PostAsync($"/api/v1/admin/outbox/{id}/requeue")).StatusCode);

        // Dono reenfileira; com o provedor de volta, a mensagem sai.
        Assert.Equal(HttpStatusCode.NoContent, (await http.SendAsync(Req(HttpMethod.Post, $"/api/v1/admin/outbox/{id}/requeue"))).StatusCode);
        email.Down = false;
        await RodaJobAsync(f);
        Assert.Equal(OutboxStatus.SENT, (await api.WithDbAsync(db => db.OutboxMessages.AsNoTracking().FirstAsync(m => m.Id == id))).Status);
    }

    [Fact]
    public async Task Duas_execucoes_simultaneas_do_job_nao_duplicam_envios()
    {
        var email = new FlakyEmailClient { Down = true };
        await using var f = ComEmail(email);
        var uids = new List<string>();
        for (var i = 0; i < 3; i++) uids.Add((await CriaConsultaAsync(f, $"i2-conc{i}", $"outbox-conc{i}@example.test", dia: 6 + i)).Uid);

        email.Down = false;
        foreach (var u in uids) await VenceTudoAsync(u);
        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Task.Run(() => RodaJobAsync(f))));

        for (var i = 0; i < 3; i++)
            Assert.Equal(1, email.Count($"outbox-conc{i}@example.test", "Consulta confirmada"));
    }

    [Fact]
    public async Task Retencao_apaga_enviadas_antigas_e_mortas_muito_antigas_mas_guarda_as_recentes()
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        await api.WithDbAsync(async db =>
        {
            OutboxMessage M(string k, OutboxStatus st, int dias) => new()
            { Channel = "EMAIL", Kind = k + id, Status = st, CreatedAt = DateTime.UtcNow.AddDays(-dias), NextAttemptAt = DateTime.UtcNow, ProcessedAt = DateTime.UtcNow.AddDays(-dias) };
            db.OutboxMessages.AddRange(M("ret.sent.velha", OutboxStatus.SENT, 8), M("ret.sent.nova", OutboxStatus.SENT, 2),
                M("ret.dead.velha", OutboxStatus.DEAD, 31), M("ret.dead.nova", OutboxStatus.DEAD, 10));
            await db.SaveChangesAsync();
        });

        using (var scope = api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IRetentionJob>().RunAsync();

        var restam = await api.WithDbAsync(db => db.OutboxMessages.AsNoTracking().Where(m => m.Kind.EndsWith(id)).Select(m => m.Kind).ToListAsync());
        Assert.Equal(new[] { "ret.dead.nova" + id, "ret.sent.nova" + id }.OrderBy(x => x), restam.OrderBy(x => x));
    }

    [Fact]
    public void Regras_de_descarte_e_espera_crescente()
    {
        var now = DateTime.UtcNow;
        Assert.True(MarcaAi.Infrastructure.Notifications.OutboxDispatcher.IsStale("booking.created", MarcaAi.Domain.Enums.BookingStatus.CANCELLED, now.AddDays(1), now));
        Assert.False(MarcaAi.Infrastructure.Notifications.OutboxDispatcher.IsStale("booking.cancelled", MarcaAi.Domain.Enums.BookingStatus.CANCELLED, now.AddDays(1), now));
        Assert.True(MarcaAi.Infrastructure.Notifications.OutboxDispatcher.IsStale("booking.reminder", MarcaAi.Domain.Enums.BookingStatus.CONFIRMED, now.AddMinutes(-1), now));
        Assert.False(MarcaAi.Infrastructure.Notifications.OutboxDispatcher.IsStale("booking.reminder", MarcaAi.Domain.Enums.BookingStatus.CONFIRMED, now.AddHours(1), now));
        var espera = MarcaAi.Infrastructure.Notifications.OutboxDispatcher.Backoff;
        for (var i = 1; i < espera.Length; i++) Assert.True(espera[i] > espera[i - 1]);
    }
}
