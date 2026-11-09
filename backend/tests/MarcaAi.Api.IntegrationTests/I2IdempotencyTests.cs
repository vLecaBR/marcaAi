using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I2: Idempotency-Key em POST /bookings e POST /bookings/{uid}/pay — duplo clique e retry de rede não duplicam nada.</summary>
[Collection("api")]
public class I2IdempotencyTests(ApiFixture api)
{
    private static DateTime ProximoDiaUtil(int dias)
    {
        var d = DateTime.UtcNow.Date.AddDays(dias);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    private async Task<(string Owner, string Evt, JsonElement[] Slots)> PreparaAsync(string slug, bool paga = false)
    {
        var pro = await api.LoginAsync($"{slug}@example.test");
        var (owner, evt, _) = await pro.OnboardAsync(slug);
        if (paga)
        {
            (await pro.PostAsync("/api/v1/dev/payouts/activate")).EnsureSuccessStatusCode();
            var r = await pro.PostAsync("/api/v1/event-types", new
            {
                title = "Paga", slug = "paga", duration = 30, locationType = "IN_PERSON", requiresConfirm = false, beforeEventBuffer = 0, afterEventBuffer = 0,
                bookingLimitDays = 60, locationValue = "Rua X", price = 9000, payOnSite = false, questions = Array.Empty<object>(),
            });
            r.EnsureSuccessStatusCode();
            evt = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
        }
        var slots = (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={ProximoDiaUtil(7):yyyy-MM-dd}&tz=America/Sao_Paulo")).GetProperty("slots").EnumerateArray().ToArray();
        return (owner, evt, slots);
    }

    private static object Corpo(string owner, string evt, JsonElement slot, string email, bool consentimento = true) => new
    {
        ownerId = owner, eventTypeId = evt, guestName = "Paciente Idem", guestEmail = email,
        startTimeUtc = slot.GetProperty("startUtc").GetString(), endTimeUtc = slot.GetProperty("endUtc").GetString(),
        guestTimeZone = "America/Sao_Paulo", consentAccepted = consentimento,
    };

    private static Task<HttpResponseMessage> Post(HttpClient http, string path, object body, string? key)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        if (key is not null) req.Headers.Add("Idempotency-Key", key);
        return http.SendAsync(req);
    }

    private static string Chave() => "k-" + Guid.NewGuid().ToString("N");

    private Task<int> ContaConsultas(string email) => api.WithDbAsync(db => db.Bookings.CountAsync(b => b.GuestEmail == email));

    [Fact]
    public async Task Mesma_chave_e_mesmo_corpo_devolve_a_mesma_consulta_sem_criar_outra()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-ok");
        var http = api.NewClient();
        var key = Chave();
        var body = Corpo(owner, evt, slots[0], "idem-ok@example.test");

        var a = await Post(http, "/api/v1/bookings", body, key);
        var b = await Post(http, "/api/v1/bookings", body, key);

        Assert.Equal(HttpStatusCode.Created, a.StatusCode);
        Assert.Equal(HttpStatusCode.Created, b.StatusCode);
        Assert.False(a.Headers.Contains("Idempotent-Replayed"));
        Assert.Equal("true", b.Headers.GetValues("Idempotent-Replayed").Single());
        var ja = await a.Content.ReadFromJsonAsync<JsonElement>();
        var jb = await b.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(ja.GetProperty("uid").GetString(), jb.GetProperty("uid").GetString());
        Assert.Equal(1, await ContaConsultas("idem-ok@example.test"));
    }

    [Fact]
    public async Task Sem_a_chave_nada_muda_o_segundo_pedido_pelo_mesmo_horario_e_recusado()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-sem");
        var http = api.NewClient();
        Assert.Equal(HttpStatusCode.Created, (await Post(http, "/api/v1/bookings", Corpo(owner, evt, slots[0], "idem-sem-a@example.test"), null)).StatusCode);
        var segundo = await Post(http, "/api/v1/bookings", Corpo(owner, evt, slots[0], "idem-sem-b@example.test"), null);
        Assert.Contains(segundo.StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity });
    }

    [Fact]
    public async Task Mesma_chave_com_outro_corpo_e_422()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-corpo");
        var http = api.NewClient();
        var key = Chave();
        Assert.Equal(HttpStatusCode.Created, (await Post(http, "/api/v1/bookings", Corpo(owner, evt, slots[0], "idem-corpo-a@example.test"), key)).StatusCode);

        var outro = await Post(http, "/api/v1/bookings", Corpo(owner, evt, slots[1], "idem-corpo-b@example.test"), key);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, outro.StatusCode);
        Assert.Equal(0, await ContaConsultas("idem-corpo-b@example.test")); // nada foi criado
    }

    [Fact]
    public async Task Resposta_de_erro_tambem_e_repetida_e_a_chave_invalida_e_400()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-erro");
        var http = api.NewClient();
        var key = Chave();
        var semConsentimento = Corpo(owner, evt, slots[0], "idem-erro@example.test", consentimento: false);

        var a = await Post(http, "/api/v1/bookings", semConsentimento, key);
        var b = await Post(http, "/api/v1/bookings", semConsentimento, key);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, a.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, b.StatusCode);
        Assert.Equal("true", b.Headers.GetValues("Idempotent-Replayed").Single());
        Assert.Equal("application/problem+json", b.Content.Headers.ContentType?.MediaType);

        Assert.Equal(HttpStatusCode.BadRequest, (await Post(http, "/api/v1/bookings", semConsentimento, "curta")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(http, "/api/v1/bookings", semConsentimento, "tem espaço e ç!")).StatusCode);
    }

    [Fact]
    public async Task Duplo_clique_simultaneo_cria_uma_unica_consulta()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-conc");
        var key = Chave();
        var body = Corpo(owner, evt, slots[0], "idem-conc@example.test");

        var respostas = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Post(api.NewClient(), "/api/v1/bookings", body, key)));

        // Cada resposta é: a original (201), um replay (201) ou "em andamento" (409). Nunca duas consultas.
        Assert.All(respostas, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict }));
        Assert.Contains(respostas, r => r.StatusCode == HttpStatusCode.Created);
        var uids = new HashSet<string>();
        foreach (var r in respostas.Where(r => r.StatusCode == HttpStatusCode.Created))
            uids.Add((await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!);
        Assert.Single(uids);
        Assert.Equal(1, await ContaConsultas("idem-conc@example.test"));
    }

    [Fact]
    public async Task Pagamento_com_a_mesma_chave_devolve_a_mesma_intencao()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-pay", paga: true);
        var http = api.NewClient();
        var criada = await Post(http, "/api/v1/bookings", Corpo(owner, evt, slots[0], "idem-pay@example.test"), Chave());
        Assert.Equal(HttpStatusCode.Created, criada.StatusCode);
        var uid = (await criada.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!;

        var key = Chave();
        var a = await Post(http, $"/api/v1/bookings/{uid}/pay", new { provider = "STRIPE" }, key);
        var b = await Post(http, $"/api/v1/bookings/{uid}/pay", new { provider = "STRIPE" }, key);
        Assert.Equal(HttpStatusCode.OK, a.StatusCode);
        Assert.Equal(HttpStatusCode.OK, b.StatusCode);
        Assert.Equal("true", b.Headers.GetValues("Idempotent-Replayed").Single());
        var ja = await a.Content.ReadFromJsonAsync<JsonElement>();
        var jb = await b.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(ja.GetProperty("providerPaymentId").GetString(), jb.GetProperty("providerPaymentId").GetString());
        Assert.Equal(ja.GetProperty("clientSecret").GetString(), jb.GetProperty("clientSecret").GetString());

        // A mesma chave em OUTRA consulta é outro escopo (a chave é por rota+uid): não colide.
        var chaveCompartilhada = await Post(http, "/api/v1/bookings/inexistente123/pay", new { provider = "STRIPE" }, key);
        Assert.Equal(HttpStatusCode.NotFound, chaveCompartilhada.StatusCode);
    }

    [Fact]
    public async Task Execucao_abandonada_e_retomada_e_chaves_vencidas_sao_limpas()
    {
        var (owner, evt, slots) = await PreparaAsync("i2-idem-aband");
        var http = api.NewClient();
        var key = Chave();
        var body = Corpo(owner, evt, slots[0], "idem-aband@example.test");

        // Simula uma execução que morreu no meio: linha IN_PROGRESS antiga, com o mesmo hash.
        var primeiro = await Post(http, "/api/v1/bookings", body, key); // cria a linha com o hash correto…
        Assert.Equal(HttpStatusCode.Created, primeiro.StatusCode);
        var uid1 = (await primeiro.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString();
        await api.WithDbAsync(db => db.IdempotencyKeys.Where(k => k.Key == key)
            .ExecuteUpdateAsync(s => s.SetProperty(k => k.State, "IN_PROGRESS").SetProperty(k => k.CreatedAt, DateTime.UtcNow.AddMinutes(-5))));

        // …e agora ela parece abandonada: a repetição retoma (executa de novo — o horário já é dele, então vira conflito do horário, não duplicata).
        var retomada = await Post(http, "/api/v1/bookings", body, key);
        Assert.NotEqual(HttpStatusCode.InternalServerError, retomada.StatusCode);
        Assert.Equal(1, await ContaConsultas("idem-aband@example.test"));
        Assert.NotNull(uid1);

        // Retenção apaga o que venceu.
        await api.WithDbAsync(db => db.IdempotencyKeys.Where(k => k.Key == key).ExecuteUpdateAsync(s => s.SetProperty(k => k.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));
        using (var scopeSvc = api.Services.CreateScope())
            await scopeSvc.ServiceProvider.GetRequiredService<MarcaAi.Application.Common.Interfaces.IRetentionJob>().RunAsync();
        Assert.False(await api.WithDbAsync(db => db.IdempotencyKeys.AnyAsync(k => k.Key == key)));
    }
}
