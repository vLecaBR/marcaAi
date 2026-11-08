using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>E-mail que só guarda o que seria enviado (para afirmar lembretes sem SMTP).</summary>
public sealed class CapturingEmailClient : IEmailClient
{
    public List<(string To, string Subject, string Html)> Sent { get; } = new();
    public Task SendAsync(string to, string subject, string html, CancellationToken cancellationToken = default)
    {
        lock (Sent) Sent.Add((to, subject, html));
        return Task.CompletedTask;
    }
}

/// <summary>V2: segurança (CSRF por origem, uid imprevisível), rate limit real, fim do trial e lembrete de verdade.</summary>
[Collection("api")]
public class V2RobustnessTests(ApiFixture api)
{
    private static DateTime ProximoDiaUtil(int dias)
    {
        var d = DateTime.UtcNow.Date.AddDays(dias);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    // ── #16 uid imprevisível ────────────────────────────────────────────────
    [Fact]
    public async Task Uid_da_consulta_e_aleatorio_e_nao_segue_o_formato_cuid_previsivel()
    {
        var pro = await api.LoginAsync("v2-uid@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v2-uid");
        var dia = ProximoDiaUtil(4);
        var slots = (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={dia:yyyy-MM-dd}&tz=America/Sao_Paulo")).GetProperty("slots").EnumerateArray().ToArray();

        var uids = new List<string>();
        for (var i = 0; i < 3; i++)
        {
            var r = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
            {
                ownerId = owner, eventTypeId = evt, guestName = "P", guestEmail = $"uid{i}@example.test",
                startTimeUtc = slots[i].GetProperty("startUtc").GetString(), endTimeUtc = slots[i].GetProperty("endUtc").GetString(),
                guestTimeZone = "America/Sao_Paulo", consentAccepted = true,
            });
            uids.Add((await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!);
        }

        Assert.All(uids, u => Assert.Matches("^[A-Za-z0-9_-]{22}$", u));      // 128 bits em base64url
        Assert.Equal(3, uids.Distinct().Count());
        Assert.DoesNotContain(uids, u => u.StartsWith('c') && u.Length == 25); // não é CUID v1
        // Adivinhar um uid vizinho não devolve nada.
        Assert.Equal(HttpStatusCode.NotFound, (await api.NewClient().GetAsync("/api/v1/bookings/" + uids[0][..^1] + "x")).StatusCode);
    }

    // ── #17 CSRF por origem ─────────────────────────────────────────────────
    [Fact]
    public async Task Requisicao_que_altera_estado_com_cookie_e_origem_estranha_e_bloqueada()
    {
        var pro = await api.LoginAsync("v2-csrf@example.test");
        await pro.OnboardAsync("v2-csrf");
        var criaTipo = new
        {
            title = "X", slug = "x-csrf", duration = 30, locationType = "IN_PERSON", requiresConfirm = false, beforeEventBuffer = 0,
            afterEventBuffer = 0, bookingLimitDays = 60, locationValue = "Rua", price = (int?)null, questions = Array.Empty<object>(),
        };

        async Task<HttpStatusCode> Envia(Action<HttpRequestMessage> ajusta)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/event-types") { Content = JsonContent.Create(criaTipo) };
            req.Headers.Add("Cookie", await CookieAsync(pro));
            ajusta(req);
            return (await api.NewClient().SendAsync(req)).StatusCode;
        }

        Assert.Equal(HttpStatusCode.Forbidden, await Envia(r => r.Headers.Add("Origin", "https://site-malicioso.example")));
        Assert.Equal(HttpStatusCode.Forbidden, await Envia(r => r.Headers.Add("Sec-Fetch-Site", "cross-site")));
        // Origem do front, ou chamada servidor→servidor (sem Origin), passam.
        Assert.Equal(HttpStatusCode.Created, await Envia(r => r.Headers.Add("Origin", "http://localhost:3000")));
    }

    [Fact]
    public async Task Rotas_publicas_sem_cookie_nao_sao_afetadas_pela_guarda_de_origem()
    {
        var r = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/magic-link/request") { Content = JsonContent.Create(new { email = "v2-publico@example.test" }) };
        r.Headers.Add("Origin", "https://qualquer.example");
        Assert.Equal(HttpStatusCode.OK, (await api.NewClient().SendAsync(r)).StatusCode);
    }

    // extrai o cookie do TestUser (ele só expõe SendAsync): refaz o login e lê o Set-Cookie
    private async Task<string> CookieAsync(TestUser u)
    {
        var http = api.NewClient();
        (await http.PostAsJsonAsync("/api/v1/auth/magic-link/request", new { email = u.Email })).EnsureSuccessStatusCode();
        var token = await api.WithDbAsync(db => db.VerificationTokens.Where(v => v.Identifier == u.Email.ToLowerInvariant())
            .OrderByDescending(v => v.Expires).Select(v => v.Token).FirstAsync());
        var resp = await http.GetAsync($"/api/v1/auth/magic-link/verify?token={token}");
        return string.Join("; ", resp.Headers.GetValues("Set-Cookie").Select(c => c.Split(';')[0]));
    }

    // ── rate limit de verdade (sem o multiplicador da suíte) ────────────────
    [Fact]
    public async Task Magic_link_excedido_por_IP_responde_429_com_Retry_After()
    {
        await using var estrito = api.WithWebHostBuilder(b =>
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimit:Multiplier"] = "1" })));
        var http = estrito.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var codigos = new List<HttpStatusCode>();
        HttpResponseMessage? ultima = null;
        for (var i = 0; i < 22; i++) // política: 20 por hora por IP
        {
            ultima = await http.PostAsJsonAsync("/api/v1/auth/magic-link/request", new { email = $"rl{i}@example.test" });
            codigos.Add(ultima.StatusCode);
        }

        Assert.Equal(20, codigos.Count(c => c == HttpStatusCode.OK));
        Assert.Equal(2, codigos.Count(c => c == HttpStatusCode.TooManyRequests));
        Assert.True(ultima!.Headers.Contains("Retry-After"));
    }

    // ── trial ────────────────────────────────────────────────────────────────
    [Fact]
    public async Task Trial_termina_no_prazo_e_o_status_de_billing_acompanha()
    {
        var pro = await api.LoginAsync("v2-trial@example.test");
        await pro.OnboardAsync("v2-trial");

        async Task<JsonElement> Trial() =>
            (await (await pro.GetAsync("/api/v1/user/billing")).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("trial");

        // Cadastro novo: em teste, ~30 dias.
        var t = await Trial();
        Assert.True(t.GetProperty("isTrialing").GetBoolean());
        Assert.InRange(t.GetProperty("daysRemaining").GetInt32(), 29, 31);

        // Passou do prazo.
        await api.WithDbAsync(async db =>
        {
            var u = await db.Users.FirstAsync(x => x.Email == "v2-trial@example.test");
            u.TrialEndsAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        });
        Assert.False((await Trial()).GetProperty("isTrialing").GetBoolean());
    }

    // ── lembrete de verdade ──────────────────────────────────────────────────
    [Fact]
    public async Task Lembrete_sai_uma_vez_para_consulta_confirmada_que_comeca_em_breve()
    {
        var email = new CapturingEmailClient();
        await using var f = api.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.RemoveAll<IEmailClient>();
            s.AddSingleton<IEmailClient>(email);
        }));
        var pro = await api.LoginAsync("v2-lembrete@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v2-lembrete");
        var dia = ProximoDiaUtil(4);
        var slots = (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={dia:yyyy-MM-dd}&tz=America/Sao_Paulo")).GetProperty("slots").EnumerateArray().ToArray();
        var criada = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = owner, eventTypeId = evt, guestName = "Paciente Lembrete", guestEmail = "lembrete@example.test",
            startTimeUtc = slots[0].GetProperty("startUtc").GetString(), endTimeUtc = slots[0].GetProperty("endUtc").GetString(),
            guestTimeZone = "America/Sao_Paulo", consentAccepted = true,
        });
        var uid = (await criada.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!;

        async Task<int> Roda() => await f.Services.CreateScope().ServiceProvider.GetRequiredService<IReminderJob>().DispatchDueAsync()
            .ContinueWith(_ => email.Sent.Count(e => e.To == "lembrete@example.test" && e.Subject.StartsWith("Lembrete")));

        // Longe (4 dias): ainda não é hora.
        Assert.Equal(0, await Roda());

        // Faltando 1 hora: o lembrete sai…
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Uid == uid);
            b.StartTime = DateTime.UtcNow.AddHours(1);
            b.EndTime = b.StartTime.AddMinutes(30);
            await db.SaveChangesAsync();
        });
        Assert.Equal(1, await Roda());
        Assert.True(await api.WithDbAsync(async db => (await db.Bookings.AsNoTracking().FirstAsync(x => x.Uid == uid)).ReminderSent));

        // …e não se repete.
        Assert.Equal(1, await Roda());
    }

    [Fact]
    public async Task Lembrete_nao_sai_para_consulta_cancelada()
    {
        var email = new CapturingEmailClient();
        await using var f = api.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.RemoveAll<IEmailClient>();
            s.AddSingleton<IEmailClient>(email);
        }));
        var pro = await api.LoginAsync("v2-lembrete-canc@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v2-lembrete-canc");
        var dia = ProximoDiaUtil(4);
        var slots = (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={dia:yyyy-MM-dd}&tz=America/Sao_Paulo")).GetProperty("slots").EnumerateArray().ToArray();
        var criada = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = owner, eventTypeId = evt, guestName = "P", guestEmail = "lembrete-canc@example.test",
            startTimeUtc = slots[0].GetProperty("startUtc").GetString(), endTimeUtc = slots[0].GetProperty("endUtc").GetString(),
            guestTimeZone = "America/Sao_Paulo", consentAccepted = true,
        });
        var uid = (await criada.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString()!;
        await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/cancel", new { reason = "teste" });
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Uid == uid);
            b.StartTime = DateTime.UtcNow.AddHours(1);
            b.EndTime = b.StartTime.AddMinutes(30);
            await db.SaveChangesAsync();
        });

        await f.Services.CreateScope().ServiceProvider.GetRequiredService<IReminderJob>().DispatchDueAsync();

        Assert.DoesNotContain(email.Sent, e => e.To == "lembrete-canc@example.test" && e.Subject.StartsWith("Lembrete"));
    }
    // ── painel do dono e captura de erros ───────────────────────────────────
    [Fact]
    public async Task Painel_do_dono_so_abre_para_admin_e_nao_expoe_dado_de_paciente()
    {
        var comum = await api.LoginAsync("v2-comum@example.test");
        await comum.OnboardAsync("v2-comum");
        var dono = await api.LoginAsync("v2-dono@example.test");
        await dono.OnboardAsync("v2-dono");

        // Usuário comum e anônimo: 404 / 401 (a rota não revela que existe).
        Assert.Equal(HttpStatusCode.NotFound, (await comum.GetAsync("/api/v1/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.NewClient().GetAsync("/api/v1/admin/overview")).StatusCode);

        // Dono (id em Admin:UserIds): números agregados.
        await using var f = api.WithWebHostBuilder(b =>
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["Admin:UserIds"] = dono.Id })));
        var http = f.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/overview");
        req.Headers.Add("Cookie", await CookieAsync(dono));
        var resp = await http.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        var j = JsonDocument.Parse(body).RootElement;
        Assert.True(j.GetProperty("users").GetProperty("total").GetInt32() >= 2);
        Assert.DoesNotContain("@example.test", body); // nenhum e-mail no payload
    }

    [Fact]
    public async Task Erro_do_navegador_e_registrado_sem_dado_pessoal_e_com_limite()
    {
        var r = await api.NewClient().PostAsJsonAsync("/api/v1/client-errors", new
        {
            message = "Falha ao renderizar para maria@example.test tel 11999990000", digest = "abc123", path = "/dra-x/consulta?token=segredo",
        });
        Assert.Equal(HttpStatusCode.NoContent, r.StatusCode);

        var e = await api.WithDbAsync(db => db.ErrorEvents.AsNoTracking().OrderByDescending(x => x.CreatedAt).FirstAsync(x => x.Source == "web"));
        Assert.DoesNotContain("maria@example.test", e.Message);
        Assert.DoesNotContain("11999990000", e.Message);
        Assert.Equal("/dra-x/consulta", e.Path); // sem querystring
    }

    [Fact]
    public async Task Excecao_nao_tratada_da_API_vai_para_o_painel_e_responde_500_padronizado()
    {
        await using var f = api.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.RemoveAll<IBookingService>();
            s.AddScoped<IBookingService, ExplodingBookingService>();
        }));
        var resp = await f.CreateClient().PostAsJsonAsync("/api/v1/bookings/qualquer-uid/cancel", new { reason = "x" });
        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);

        var achado = await api.WithDbAsync(db => db.ErrorEvents.AsNoTracking().AnyAsync(x => x.Source == "api" && x.Message.Contains("boom-de-teste")));
        Assert.True(achado);
    }
}

/// <summary>Serviço que explode ao cancelar, para provar a captura de exceções não tratadas dentro do pipeline.</summary>
public sealed class ExplodingBookingService : MarcaAi.Application.Common.Interfaces.IBookingService
{
    public Task<MarcaAi.Application.Features.Bookings.CreateBookingResult> CreateAsync(MarcaAi.Application.Features.Bookings.CreateBookingRequest request, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<MarcaAi.Application.Features.Bookings.CancelBookingResult> CancelAsync(string uid, string? reason, string? canceledBy, string? actorUserId = null, CancellationToken cancellationToken = default) => throw new InvalidOperationException("boom-de-teste");
    public Task<MarcaAi.Application.Features.Bookings.RescheduleBookingResult> RescheduleAsync(string uid, DateTimeOffset newStartUtc, DateTimeOffset newEndUtc, string? actorUserId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task OnPaymentConfirmedAsync(string uid, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<MarcaAi.Application.Features.Bookings.ConfirmBookingResult> ConfirmAsync(string uid, string actorUserId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
}
