using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>V1 do plano de venda: cobrança (pagar para confirmar / pagar no local), expiração, remarcação, pacientes e calendário.</summary>
[Collection("api")]
public class V1ProductTests(ApiFixture api)
{
    // ── helpers ──────────────────────────────────────────────────────────────
    private static DateTime ProximoDiaUtil(int apartirDeDias)
    {
        var d = DateTime.UtcNow.Date.AddDays(apartirDeDias);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    private static object NovoTipo(string slug, int? preco, bool pagarNoLocal = false, string location = "IN_PERSON", string? valor = "Rua X, 1") => new
    {
        title = "Serviço " + slug, slug, duration = 30, locationType = location, requiresConfirm = false, beforeEventBuffer = 0, afterEventBuffer = 0,
        bookingLimitDays = 60, locationValue = valor, price = preco, payOnSite = pagarNoLocal, questions = Array.Empty<object>(),
    };

    private async Task<string> CriaTipoAsync(TestUser pro, object corpo)
    {
        var r = await pro.PostAsync("/api/v1/event-types", corpo);
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private async Task<JsonElement[]> SlotsAsync(string owner, string evt, DateTime dia) =>
        (await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={dia:yyyy-MM-dd}&tz=America/Sao_Paulo"))
            .GetProperty("slots").EnumerateArray().ToArray();

    private static object Corpo(string owner, string evt, JsonElement slot, string email) => new
    {
        ownerId = owner, eventTypeId = evt, guestName = "Paciente V1", guestEmail = email, guestPhone = "11988887777",
        startTimeUtc = slot.GetProperty("startUtc").GetString(), endTimeUtc = slot.GetProperty("endUtc").GetString(),
        guestTimeZone = "America/Sao_Paulo", consentAccepted = true, responses = Array.Empty<object>(),
    };

    private async Task<(string Uid, JsonElement Json)> AgendaAsync(string owner, string evt, JsonElement slot, string email)
    {
        var r = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slot, email));
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var j = await r.Content.ReadFromJsonAsync<JsonElement>();
        return (j.GetProperty("uid").GetString()!, j);
    }

    private Task<T> Booking<T>(string uid, Func<MarcaAi.Domain.Entities.Booking, T> f) =>
        api.WithDbAsync(async db => f(await db.Bookings.AsNoTracking().FirstAsync(b => b.Uid == uid)));

    // ── regra de cobrança (D14) ──────────────────────────────────────────────
    [Fact]
    public async Task Servico_pago_online_sem_conta_de_recebimento_nao_pode_ser_criado()
    {
        var pro = await api.LoginAsync("v1-semconta@example.test");
        await pro.OnboardAsync("v1-semconta");

        var r = await pro.PostAsync("/api/v1/event-types", NovoTipo("pago", 15000));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, r.StatusCode);
        Assert.Contains("recebimentos", await r.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Pagar_no_local_confirma_na_hora_sem_conta_de_recebimento()
    {
        var pro = await api.LoginAsync("v1-nolocal@example.test");
        var (owner, _, _) = await pro.OnboardAsync("v1-nolocal");
        var evt = await CriaTipoAsync(pro, NovoTipo("local", 15000, pagarNoLocal: true));
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(3));

        var (uid, json) = await AgendaAsync(owner, evt, slots[0], "p-nolocal@example.test");

        Assert.Equal("CONFIRMED", json.GetProperty("status").GetString());
        Assert.False(json.GetProperty("paymentRequired").GetBoolean());
        Assert.Null(await Booking(uid, b => b.PaymentDueAt));
    }

    [Fact]
    public async Task Jornada_paga_reserva_pendente_paga_e_confirma()
    {
        var pro = await api.LoginAsync("v1-pago@example.test");
        var (owner, _, _) = await pro.OnboardAsync("v1-pago");
        (await pro.PostAsync("/api/v1/dev/payouts/activate")).EnsureSuccessStatusCode();
        var evt = await CriaTipoAsync(pro, NovoTipo("pago", 15000));
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(3));

        var (uid, json) = await AgendaAsync(owner, evt, slots[0], "p-pago@example.test");

        // Reserva: PENDING, segurando o horário, com prazo.
        Assert.Equal("PENDING", json.GetProperty("status").GetString());
        Assert.True(json.GetProperty("paymentRequired").GetBoolean());
        Assert.Equal(15000, json.GetProperty("priceCents").GetInt32());
        Assert.NotNull(await Booking(uid, b => b.PaymentDueAt));

        // Outro paciente não pega o horário enquanto está reservado.
        var outro = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "outro@example.test"));
        Assert.Contains(outro.StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity });

        // Paga (simulado): confirma e zera o prazo.
        var pay = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/pay", new { provider = "STRIPE" });
        Assert.Equal(HttpStatusCode.OK, pay.StatusCode);
        Assert.StartsWith("fake_secret_", (await pay.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("clientSecret").GetString());
        (await api.NewClient().PostAsync($"/api/v1/dev/payments/{uid}/approve", null)).EnsureSuccessStatusCode();

        var (st, ps, due) = await Booking(uid, b => (b.Status, b.PaymentStatus, b.PaymentDueAt));
        Assert.Equal(BookingStatus.CONFIRMED, st);
        Assert.Equal(PaymentStatus.PAID, ps);
        Assert.Null(due);
    }

    [Fact]
    public async Task Reserva_sem_pagamento_expira_e_libera_o_horario()
    {
        var pro = await api.LoginAsync("v1-expira@example.test");
        var (owner, _, _) = await pro.OnboardAsync("v1-expira");
        (await pro.PostAsync("/api/v1/dev/payouts/activate")).EnsureSuccessStatusCode();
        var evt = await CriaTipoAsync(pro, NovoTipo("pago", 9000));
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(3));
        var (uid, _) = await AgendaAsync(owner, evt, slots[0], "p-expira@example.test");

        // Ainda dentro do prazo: o job não mexe.
        Assert.Equal(0, await api.WithServicesAsync(sp => sp.GetRequiredService<IExpireUnpaidBookingsJob>().RunAsync()));

        // Vence o prazo (além da tolerância).
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Uid == uid);
            b.PaymentDueAt = DateTime.UtcNow.AddMinutes(-10);
            await db.SaveChangesAsync();
        });
        Assert.True(await api.WithServicesAsync(sp => sp.GetRequiredService<IExpireUnpaidBookingsJob>().RunAsync()) >= 1);

        var (st, by) = await Booking(uid, b => (b.Status, b.CanceledBy));
        Assert.Equal(BookingStatus.CANCELLED, st);
        Assert.Equal(CanceledBy.SYSTEM, by);

        // Horário liberado: outro paciente consegue; e pagar a reserva expirada é recusado.
        var novo = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "outro-expira@example.test"));
        Assert.Equal(HttpStatusCode.Created, novo.StatusCode);
        var pay = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/pay", new { provider = "STRIPE" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, pay.StatusCode);
    }

    [Fact]
    public async Task Pagamento_que_chega_depois_da_expiracao_e_reembolsado()
    {
        var pro = await api.LoginAsync("v1-tarde@example.test");
        var (owner, _, _) = await pro.OnboardAsync("v1-tarde");
        (await pro.PostAsync("/api/v1/dev/payouts/activate")).EnsureSuccessStatusCode();
        var evt = await CriaTipoAsync(pro, NovoTipo("pago", 9000));
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(3));
        var (uid, _) = await AgendaAsync(owner, evt, slots[0], "p-tarde@example.test");
        (await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/pay", new { provider = "STRIPE" })).EnsureSuccessStatusCode();

        // A reserva expira antes do webhook chegar.
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Uid == uid);
            b.PaymentDueAt = DateTime.UtcNow.AddMinutes(-10);
            await db.SaveChangesAsync();
        });
        await api.WithServicesAsync(sp => sp.GetRequiredService<IExpireUnpaidBookingsJob>().RunAsync());

        (await api.NewClient().PostAsync($"/api/v1/dev/payments/{uid}/approve", null)).EnsureSuccessStatusCode();

        var (st, ps) = await Booking(uid, b => (b.Status, b.PaymentStatus));
        Assert.Equal(BookingStatus.CANCELLED, st);
        Assert.Equal(PaymentStatus.REFUNDED, ps);
    }

    // ── validações de agenda ─────────────────────────────────────────────────
    [Fact]
    public async Task Agendar_no_passado_e_recusado()
    {
        var pro = await api.LoginAsync("v1-passado@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-passado");
        var ontem = DateTime.UtcNow.Date.AddDays(-1);
        while (ontem.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) ontem = ontem.AddDays(-1);
        var inicio = ontem.AddHours(14); // 11h em São Paulo, dentro da agenda padrão (09–18)

        var r = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", new
        {
            ownerId = owner, eventTypeId = evt, guestName = "X", guestEmail = "passado@example.test",
            startTimeUtc = inicio, endTimeUtc = inicio.AddMinutes(30), guestTimeZone = "America/Sao_Paulo", consentAccepted = true,
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, r.StatusCode);
    }

    [Fact]
    public async Task Consulta_online_sem_link_e_sem_Google_e_recusada()
    {
        var pro = await api.LoginAsync("v1-online@example.test");
        await pro.OnboardAsync("v1-online");

        var semLink = await pro.PostAsync("/api/v1/event-types", NovoTipo("meet", null, location: "GOOGLE_MEET", valor: null));
        var comLink = await pro.PostAsync("/api/v1/event-types", NovoTipo("zoom", null, location: "ZOOM", valor: "https://zoom.us/j/123"));
        var presencialSemEndereco = await pro.PostAsync("/api/v1/event-types", NovoTipo("pres", null, location: "IN_PERSON", valor: ""));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, semLink.StatusCode);
        Assert.Equal(HttpStatusCode.Created, comLink.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, presencialSemEndereco.StatusCode);
    }

    // ── remarcar (D15) ───────────────────────────────────────────────────────
    [Fact]
    public async Task Paciente_remarca_libera_o_horario_antigo_e_respeita_limite_e_antecedencia()
    {
        var pro = await api.LoginAsync("v1-remarca@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-remarca");
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(4));
        var (uid, _) = await AgendaAsync(owner, evt, slots[0], "p-remarca@example.test");

        object Novo(JsonElement s) => new { startTimeUtc = s.GetProperty("startUtc").GetString(), endTimeUtc = s.GetProperty("endUtc").GetString() };

        // 1ª remarcação: ok.
        var r1 = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule", Novo(slots[2]));
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        Assert.Equal(1, await Booking(uid, b => b.RescheduleCount));

        // O horário antigo ficou livre para outro paciente.
        var ocupa = await api.NewClient().PostAsJsonAsync("/api/v1/bookings", Corpo(owner, evt, slots[0], "outro-remarca@example.test"));
        Assert.Equal(HttpStatusCode.Created, ocupa.StatusCode);

        // Remarcar para um horário já ocupado: conflito.
        var conflito = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule", Novo(slots[0]));
        Assert.Equal(HttpStatusCode.Conflict, conflito.StatusCode);

        // Remarcar para o próprio horário atual funciona (a consulta não conflita consigo mesma) e conta como 2ª.
        var r2 = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule", Novo(slots[3]));
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);

        // 3ª remarcação do paciente: limite.
        var r3 = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule", Novo(slots[4]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r3.StatusCode);
        Assert.Contains("LimitReached", await r3.Content.ReadAsStringAsync());

        // O profissional remarca sem o limite.
        var rPro = await pro.PostAsync($"/api/v1/bookings/{uid}/reschedule", Novo(slots[4]));
        Assert.Equal(HttpStatusCode.OK, rPro.StatusCode);
    }

    [Fact]
    public async Task Paciente_nao_remarca_com_menos_de_24h_mas_o_profissional_pode()
    {
        var pro = await api.LoginAsync("v1-tarde24@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-tarde24");
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(4));
        var (uid, _) = await AgendaAsync(owner, evt, slots[0], "p-tarde24@example.test");

        // A consulta passa a começar daqui a 2 horas (simula a proximidade).
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.FirstAsync(x => x.Uid == uid);
            b.StartTime = DateTime.UtcNow.AddHours(2);
            b.EndTime = b.StartTime.AddMinutes(30);
            await db.SaveChangesAsync();
        });

        var r = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule",
            new { startTimeUtc = slots[2].GetProperty("startUtc").GetString(), endTimeUtc = slots[2].GetProperty("endUtc").GetString() });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r.StatusCode);
        Assert.Contains("TooLate", await r.Content.ReadAsStringAsync());

        var rPro = await pro.PostAsync($"/api/v1/bookings/{uid}/reschedule",
            new { startTimeUtc = slots[2].GetProperty("startUtc").GetString(), endTimeUtc = slots[2].GetProperty("endUtc").GetString() });
        Assert.Equal(HttpStatusCode.OK, rPro.StatusCode);
    }

    [Fact]
    public async Task Remarcar_para_fora_da_agenda_e_recusado()
    {
        var pro = await api.LoginAsync("v1-foraagenda@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-foraagenda");
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(4));
        var (uid, _) = await AgendaAsync(owner, evt, slots[0], "p-fora@example.test");

        var madrugada = ProximoDiaUtil(4).AddHours(5); // 02h em São Paulo
        var r = await api.NewClient().PostAsJsonAsync($"/api/v1/bookings/{uid}/reschedule",
            new { startTimeUtc = madrugada, endTimeUtc = madrugada.AddMinutes(30) });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, r.StatusCode);
    }

    // ── pacientes e calendário ───────────────────────────────────────────────
    [Fact]
    public async Task Lista_de_pacientes_agrupa_por_email_busca_e_isola_por_profissional()
    {
        var pro = await api.LoginAsync("v1-pacientes@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-pacientes");
        var outroPro = await api.LoginAsync("v1-pacientes-outro@example.test");
        await outroPro.OnboardAsync("v1-pacientes-outro");
        var slots = await SlotsAsync(owner, evt, ProximoDiaUtil(5));
        await AgendaAsync(owner, evt, slots[0], "Maria@Example.test");
        await AgendaAsync(owner, evt, slots[1], "maria@example.test"); // mesmo e-mail (caixa diferente) → mesma pessoa
        await AgendaAsync(owner, evt, slots[2], "joao@example.test");

        var todos = await (await pro.GetAsync("/api/v1/patients")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, todos.GetArrayLength());
        var maria = todos.EnumerateArray().First(p => p.GetProperty("email").GetString() == "maria@example.test");
        Assert.Equal(2, maria.GetProperty("totalBookings").GetInt32());
        Assert.NotNull(maria.GetProperty("nextBookingAt").GetString());

        var busca = await (await pro.GetAsync("/api/v1/patients?q=joao")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, busca.GetArrayLength());

        var detalhe = await pro.GetAsync("/api/v1/patients/detail?email=maria@example.test");
        Assert.Equal(HttpStatusCode.OK, detalhe.StatusCode);
        Assert.Equal(2, (await detalhe.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("bookings").GetArrayLength());

        // O outro profissional não enxerga esses pacientes (nem por detalhe).
        var doOutro = await (await outroPro.GetAsync("/api/v1/patients")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, doOutro.GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await outroPro.GetAsync("/api/v1/patients/detail?email=maria@example.test")).StatusCode);

        // Anônimo não acessa.
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.NewClient().GetAsync("/api/v1/patients")).StatusCode);
    }

    [Fact]
    public async Task Calendario_do_mes_so_lista_dias_com_horario_livre()
    {
        var pro = await api.LoginAsync("v1-mes@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("v1-mes");
        var mes = DateTime.UtcNow.AddDays(10).ToString("yyyy-MM");

        var r = await api.NewClient().GetFromJsonAsync<JsonElement>(
            $"/api/v1/slots/month?ownerId={owner}&eventTypeId={evt}&month={mes}&tz=America/Sao_Paulo");
        var dias = r.GetProperty("days").EnumerateArray().Select(d => DateTime.Parse(d.GetString()!)).ToList();

        Assert.NotEmpty(dias);
        Assert.All(dias, d => Assert.DoesNotContain(d.DayOfWeek, new[] { DayOfWeek.Saturday, DayOfWeek.Sunday })); // agenda padrão: seg–sex
        Assert.All(dias, d => Assert.True(d.Date >= DateTime.UtcNow.Date.AddDays(-1)));
    }
}
