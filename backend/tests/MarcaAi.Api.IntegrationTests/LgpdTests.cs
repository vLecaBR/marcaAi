using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>Gate LGPD da F8: consentimento gravado, DSAR (exportar/anonimizar/excluir) e retenção.</summary>
[Collection("api")]
public class LgpdTests(ApiFixture api)
{
    private static string Dia()
    {
        var d = DateTime.UtcNow.Date.AddDays(3);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d.ToString("yyyy-MM-dd");
    }

    private sealed record Cenario(TestUser Pro, string OwnerId, string EventTypeId, JsonElement[] Slots);

    private async Task<Cenario> ProfissionalAsync(string prefixo)
    {
        var pro = await api.LoginAsync($"{prefixo}@example.test");
        var (owner, evt, _) = await pro.OnboardAsync(prefixo);
        var slots = await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={Dia()}&tz=America/Sao_Paulo");
        return new Cenario(pro, owner, evt, slots.GetProperty("slots").EnumerateArray().ToArray());
    }

    private async Task<string> AgendaAsync(Cenario c, int slot, string email, string nome = "Paciente LGPD")
    {
        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = c.OwnerId, eventTypeId = c.EventTypeId, guestName = nome, guestEmail = email, guestPhone = "11988887777",
            guestNotes = "dado sensível de saúde", startTimeUtc = c.Slots[slot].GetProperty("startUtc").GetString(),
            endTimeUtc = c.Slots[slot].GetProperty("endUtc").GetString(), guestTimeZone = "America/Sao_Paulo",
            consentAccepted = true, responses = Array.Empty<object>(),
        });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        return (await resp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!;
    }

    // ---------- Consentimento ----------

    [Fact]
    public async Task Consentimento_e_gravado_com_data_e_versao_da_politica()
    {
        var c = await ProfissionalAsync("lgpd-consent");
        var uid = await AgendaAsync(c, 0, "consent@example.test");

        var b = await api.WithDbAsync(db => db.Bookings.Where(x => x.Uid == uid).Select(x => new { x.ConsentAt, x.ConsentVersion }).SingleAsync());

        Assert.NotNull(b.ConsentAt);
        Assert.InRange(b.ConsentAt!.Value, DateTime.UtcNow.AddMinutes(-2), DateTime.UtcNow.AddMinutes(1));
        Assert.False(string.IsNullOrWhiteSpace(b.ConsentVersion));
    }

    [Fact]
    public async Task Sem_consentimento_nada_e_gravado()
    {
        var c = await ProfissionalAsync("lgpd-noconsent");

        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = c.OwnerId, eventTypeId = c.EventTypeId, guestName = "X", guestEmail = "sem-consent-lgpd@example.test",
            startTimeUtc = c.Slots[0].GetProperty("startUtc").GetString(), endTimeUtc = c.Slots[0].GetProperty("endUtc").GetString(),
            guestTimeZone = "UTC", consentAccepted = false,
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(0, await api.WithDbAsync(db => db.Bookings.CountAsync(x => x.GuestEmail == "sem-consent-lgpd@example.test")));
    }

    // ---------- DSAR: acesso/portabilidade ----------

    [Fact]
    public async Task Exportar_paciente_devolve_so_dados_do_profissional_que_pediu()
    {
        var a = await ProfissionalAsync("lgpd-exp-a");
        var b = await ProfissionalAsync("lgpd-exp-b");
        await AgendaAsync(a, 0, "titular-exp@example.test", "Titular A");
        await AgendaAsync(b, 0, "titular-exp@example.test", "Titular B");

        var doA = await (await a.Pro.PostAsync("/api/v1/privacy/patients/export", new { email = "Titular-Exp@example.test" }))
            .Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(1, doA.GetProperty("total").GetInt32());
        var consulta = doA.GetProperty("consultas")[0];
        Assert.Equal("Titular A", consulta.GetProperty("paciente").GetProperty("guestName").GetString());
        Assert.NotEqual(JsonValueKind.Null, consulta.GetProperty("consentimento").GetProperty("consentAt").ValueKind);
    }

    [Fact]
    public async Task Rotas_de_privacidade_exigem_login()
    {
        var http = api.NewClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.PostAsJsonAsync("/api/v1/privacy/patients/export", new { email = "x@y.z" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.PostAsJsonAsync("/api/v1/privacy/patients/anonymize", new { email = "x@y.z" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/v1/privacy/account/export")).StatusCode);
    }

    // ---------- DSAR: anonimização ----------

    [Fact]
    public async Task Anonimizar_paciente_remove_identificadores_e_preserva_o_financeiro()
    {
        var c = await ProfissionalAsync("lgpd-anon");
        var uid = await AgendaAsync(c, 0, "anon-titular@example.test");
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.SingleAsync(x => x.Uid == uid);
            b.PriceCents = 15000;
            b.PaymentStatus = PaymentStatus.PAID;
            await db.SaveChangesAsync();
        });

        var resp = await c.Pro.PostAsync("/api/v1/privacy/patients/anonymize", new { email = "anon-titular@example.test" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var b2 = await api.WithDbAsync(db => db.Bookings.Where(x => x.Uid == uid)
            .Select(x => new { x.GuestName, x.GuestEmail, x.GuestPhone, x.GuestNotes, x.PriceCents, x.PaymentStatus }).SingleAsync());
        Assert.Equal("Paciente anonimizado", b2.GuestName);
        Assert.EndsWith("@anonimizado.invalid", b2.GuestEmail);
        Assert.Null(b2.GuestPhone);
        Assert.Null(b2.GuestNotes);
        Assert.Equal(15000, b2.PriceCents);          // Art. 16, I: registro fiscal/financeiro preservado
        Assert.Equal(PaymentStatus.PAID, b2.PaymentStatus);
    }

    [Fact]
    public async Task Profissional_nao_anonimiza_paciente_de_outro_profissional()
    {
        var dono = await ProfissionalAsync("lgpd-anon-dono");
        var outro = await api.LoginAsync("lgpd-anon-outro@example.test");
        var uid = await AgendaAsync(dono, 0, "anon-alheio@example.test");

        var resp = await outro.PostAsync("/api/v1/privacy/patients/anonymize", new { email = "anon-alheio@example.test" });

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Equal("Paciente LGPD", await api.WithDbAsync(db => db.Bookings.Where(x => x.Uid == uid).Select(x => x.GuestName).SingleAsync()));
    }

    // ---------- DSAR: eliminação da conta ----------

    [Fact]
    public async Task Excluir_conta_exige_confirmacao_explicita()
    {
        var u = await api.LoginAsync("lgpd-del-confirm@example.test");

        var sem = await u.SendAsync(HttpMethod.Delete, "/api/v1/privacy/account", new { confirm = "sim" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, sem.StatusCode);
        Assert.True(await api.WithDbAsync(db => db.Users.AnyAsync(x => x.Id == u.Id)));
    }

    [Fact]
    public async Task Excluir_conta_remove_usuario_agenda_e_consultas_e_encerra_a_sessao()
    {
        var c = await ProfissionalAsync("lgpd-del");
        await AgendaAsync(c, 0, "del-titular@example.test");

        var resp = await c.Pro.SendAsync(HttpMethod.Delete, "/api/v1/privacy/account", new { confirm = "EXCLUIR" });

        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);
        Assert.False(await api.WithDbAsync(db => db.Users.AnyAsync(x => x.Id == c.Pro.Id)));
        Assert.Equal(0, await api.WithDbAsync(db => db.Bookings.CountAsync(x => x.UserId == c.Pro.Id)));
        Assert.Equal(0, await api.WithDbAsync(db => db.EventTypes.CountAsync(x => x.UserId == c.Pro.Id)));
    }

    [Fact]
    public async Task Exportar_conta_devolve_so_os_dados_do_proprio_usuario()
    {
        var u = await api.LoginAsync("lgpd-acc-exp@example.test");
        await u.OnboardAsync("lgpd-acc-exp");

        var resp = await u.GetAsync("/api/v1/privacy/account/export");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var txt = await resp.Content.ReadAsStringAsync();
        Assert.Contains("lgpd-acc-exp@example.test", txt);
        Assert.DoesNotContain("senha", txt, StringComparison.OrdinalIgnoreCase);
    }

    // ---------- Retenção (job diário) ----------

    [Fact]
    public async Task Job_de_retencao_anonimiza_consulta_antiga_e_preserva_a_recente()
    {
        var c = await ProfissionalAsync("lgpd-ret");
        var antiga = await AgendaAsync(c, 0, "ret-antigo@example.test", "Paciente Antigo");
        var recente = await AgendaAsync(c, 3, "ret-recente@example.test", "Paciente Recente");
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.SingleAsync(x => x.Uid == antiga);
            b.StartTime = DateTime.UtcNow.AddMonths(-30);
            b.EndTime = b.StartTime.AddMinutes(30);
            await db.SaveChangesAsync();
        });

        using (var scope = api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IRetentionJob>().RunAsync();

        var a = await api.WithDbAsync(db => db.Bookings.Where(x => x.Uid == antiga).Select(x => new { x.GuestName, x.GuestEmail, x.GuestPhone, x.GuestNotes }).SingleAsync());
        Assert.Equal("Paciente anonimizado", a.GuestName);
        Assert.EndsWith("@anonimizado.invalid", a.GuestEmail);
        Assert.Null(a.GuestPhone);
        Assert.Null(a.GuestNotes);
        Assert.Equal("Paciente Recente", await api.WithDbAsync(db => db.Bookings.Where(x => x.Uid == recente).Select(x => x.GuestName).SingleAsync()));
    }

    [Fact]
    public async Task Job_de_retencao_limpa_tokens_expirados_e_eventos_de_webhook_antigos()
    {
        await api.WithDbAsync(async db =>
        {
            db.VerificationTokens.Add(new MarcaAi.Domain.Entities.VerificationToken
            { Identifier = "ret-old@example.test", Token = "tok-ret-old", Expires = DateTime.UtcNow.AddDays(-3) });
            db.VerificationTokens.Add(new MarcaAi.Domain.Entities.VerificationToken
            { Identifier = "ret-new@example.test", Token = "tok-ret-new", Expires = DateTime.UtcNow.AddMinutes(10) });
            db.ProcessedWebhookEvents.Add(new MarcaAi.Domain.Entities.ProcessedWebhookEvent
            { Provider = "stripe-billing", EventId = "evt_ret_old", ProcessedAt = DateTime.UtcNow.AddDays(-120) });
            db.ProcessedWebhookEvents.Add(new MarcaAi.Domain.Entities.ProcessedWebhookEvent
            { Provider = "stripe-billing", EventId = "evt_ret_new", ProcessedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });

        using (var scope = api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IRetentionJob>().RunAsync();

        Assert.False(await api.WithDbAsync(db => db.VerificationTokens.AnyAsync(v => v.Token == "tok-ret-old")));
        Assert.True(await api.WithDbAsync(db => db.VerificationTokens.AnyAsync(v => v.Token == "tok-ret-new")));
        Assert.False(await api.WithDbAsync(db => db.ProcessedWebhookEvents.AnyAsync(e => e.EventId == "evt_ret_old")));
        Assert.True(await api.WithDbAsync(db => db.ProcessedWebhookEvents.AnyAsync(e => e.EventId == "evt_ret_new")));
    }

    [Fact]
    public async Task Job_de_retencao_cifra_tokens_do_Google_que_estavam_em_texto()
    {
        var u = await api.LoginAsync("lgpd-ret-google@example.test");
        await api.WithDbAsync(async db =>
        {
            db.Accounts.Add(new MarcaAi.Domain.Entities.Account
            {
                Id = "acc-it-ret", UserId = u.Id, Type = "oauth", Provider = "google", ProviderAccountId = "gsub-it-ret",
                AccessToken = "plain-access", RefreshToken = "plain-refresh",
            });
            await db.SaveChangesAsync();
        });

        using (var scope = api.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IRetentionJob>().RunAsync();

        var acc = await api.WithDbAsync(db => db.Accounts.Where(a => a.Id == "acc-it-ret").Select(a => new { a.AccessToken, a.RefreshToken }).SingleAsync());
        Assert.StartsWith("enc:", acc.AccessToken);
        Assert.StartsWith("enc:", acc.RefreshToken);
        Assert.DoesNotContain("plain", acc.AccessToken);
    }
}
