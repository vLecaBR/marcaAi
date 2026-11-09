using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.IntegrationTests;

[Collection("api")]
public class BookingTests(ApiFixture api)
{
    private static string Dia()
    {
        var d = DateTime.UtcNow.Date.AddDays(3);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d.ToString("yyyy-MM-dd");
    }

    private async Task<(string OwnerId, string EventTypeId, string Username, JsonElement[] Slots)> ProfissionalAsync(string prefixo)
    {
        var pro = await api.LoginAsync($"{prefixo}@example.test");
        var (owner, evt, user) = await pro.OnboardAsync(prefixo);
        var slots = await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={Dia()}&tz=America/Sao_Paulo");
        return (owner, evt, user, slots.GetProperty("slots").EnumerateArray().ToArray());
    }

    private static object Corpo(string owner, string evt, JsonElement slot, string email, bool consentimento = true) => new
    {
        ownerId = owner, eventTypeId = evt, guestName = "Paciente Teste", guestEmail = email, guestPhone = "11999990000",
        guestNotes = "obs", startTimeUtc = slot.GetProperty("startUtc").GetString(), endTimeUtc = slot.GetProperty("endUtc").GetString(),
        guestTimeZone = "America/Sao_Paulo", consentAccepted = consentimento, responses = Array.Empty<object>(),
    };

    [Fact]
    public async Task Agendar_cria_a_consulta_e_o_detalhe_publico_responde_por_uid()
    {
        var (owner, evt, _, slots) = await ProfissionalAsync("it-book-ok");

        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "paciente-ok@example.test"));
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);

        var uid = (await resp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString();
        var detalhe = await api.NewClient().GetAsync($"/api/v1/bookings/{uid}");
        Assert.Equal(HttpStatusCode.OK, detalhe.StatusCode);
    }

    [Fact]
    public async Task Sem_consentimento_LGPD_o_agendamento_e_recusado()
    {
        var (owner, evt, _, slots) = await ProfissionalAsync("it-book-consent");

        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "sem-consent@example.test", consentimento: false));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
    }

    [Fact]
    public async Task Segundo_agendamento_no_mesmo_horario_e_recusado()
    {
        var (owner, evt, _, slots) = await ProfissionalAsync("it-book-dup");

        var a = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "a@example.test"));
        var b = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "b@example.test"));

        Assert.Equal(HttpStatusCode.Created, a.StatusCode);
        Assert.Contains(b.StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity });
    }

    [Fact]
    public async Task Agendamentos_concorrentes_no_mesmo_horario_so_um_passa()
    {
        var (owner, evt, _, slots) = await ProfissionalAsync("it-book-race");

        var disparos = Enumerable.Range(0, 6).Select(i =>
            api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[1], $"race{i}@example.test"))).ToArray();
        var respostas = await Task.WhenAll(disparos);

        Assert.Equal(1, respostas.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.All(respostas.Where(r => r.StatusCode != HttpStatusCode.Created),
            r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity }));

        var inicio = slots[1].GetProperty("startUtc").GetDateTimeOffset().UtcDateTime;
        var noBanco = await api.WithDbAsync(db => db.Bookings.CountAsync(b => b.UserId == owner && b.StartTime == inicio));
        Assert.Equal(1, noBanco);
    }

    [Fact]
    public async Task Cancelar_libera_o_horario_e_cancelar_de_novo_da_conflito()
    {
        var (owner, evt, _, slots) = await ProfissionalAsync("it-book-cancel");
        var criado = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[2], "cancel@example.test"));
        var uid = (await criado.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("uid").GetString();

        var c1 = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/cancel", new { reason = "imprevisto", canceledBy = "GUEST" });
        var c2 = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/cancel", new { reason = "de novo", canceledBy = "GUEST" });

        Assert.Equal(HttpStatusCode.OK, c1.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, c2.StatusCode);

        // O horário volta a ser agendável.
        var novo = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[2], "outro@example.test"));
        Assert.Equal(HttpStatusCode.Created, novo.StatusCode);
    }

    [Fact]
    public async Task Cancelar_uid_inexistente_da_404()
    {
        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/bookings/uid-que-nao-existe/cancel", new { reason = "x", canceledBy = "GUEST" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Listagem_exige_login_e_mostra_so_as_consultas_do_proprio_profissional()
    {
        var (ownerA, evtA, _, slotsA) = await ProfissionalAsync("it-list-a");
        await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(ownerA, evtA, slotsA[0], "lista@example.test"));

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.NewClient().GetAsync("/api/v1/bookings")).StatusCode);

        var a = await api.LoginAsync("it-list-a@example.test");
        var outro = await api.LoginAsync("it-list-b@example.test");

        var minhas = await (await a.GetAsync("/api/v1/bookings")).Content.ReadFromJsonAsync<JsonElement>();
        var alheias = await (await outro.GetAsync("/api/v1/bookings")).Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(minhas.GetProperty("items").GetArrayLength() >= 1);
        Assert.Equal(0, alheias.GetProperty("items").GetArrayLength());
        Assert.Equal(0, alheias.GetProperty("total").GetInt32());
    }
}
