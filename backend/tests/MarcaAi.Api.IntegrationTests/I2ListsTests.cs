using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Xunit.Abstractions;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I2: listas paginadas no servidor (consultas, pacientes, resumo do dashboard) e desempenho com 10 mil linhas.</summary>
[Collection("api")]
public class I2ListsTests(ApiFixture api, ITestOutputHelper output)
{
    /// <summary>Semeia consultas direto no banco: <paramref name="pacientes"/> pacientes × <paramref name="porPaciente"/> consultas.</summary>
    private async Task SemeiaAsync(string owner, string evt, int pacientes, int porPaciente, string prefixo)
    {
        var agora = DateTime.UtcNow;
        await api.WithDbAsync(async db =>
        {
            db.ChangeTracker.AutoDetectChangesEnabled = false;
            var lote = new List<Booking>();
            for (var p = 0; p < pacientes; p++)
                for (var k = 0; k < porPaciente; k++)
                {
                    var i = p * porPaciente + k;
                    var inicio = agora.AddHours(i % 2 == 0 ? (i + 1) : -(i + 1)); // metade no futuro, metade no passado
                    lote.Add(new Booking
                    {
                        UserId = owner, EventTypeId = evt, GuestName = $"Paciente {prefixo} {p:D4}", GuestEmail = $"{prefixo}-{p:D4}@example.test",
                        GuestPhone = $"1199{p:D6}", StartTime = inicio, EndTime = inicio.AddMinutes(30), GuestTimeZone = "America/Sao_Paulo",
                        Status = k % 7 == 0 ? BookingStatus.CANCELLED : (k % 5 == 0 ? BookingStatus.PENDING : BookingStatus.CONFIRMED),
                        CreatedAt = agora, UpdatedAt = agora,
                    });
                    if (lote.Count == 2000) { db.Bookings.AddRange(lote); await db.SaveChangesAsync(); lote.Clear(); db.ChangeTracker.Clear(); }
                }
            if (lote.Count > 0) { db.Bookings.AddRange(lote); await db.SaveChangesAsync(); }
        });
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Consultas_paginam_filtram_por_aba_e_busca_no_servidor()
    {
        var pro = await api.LoginAsync("i2-pag@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-pag");
        await SemeiaAsync(owner, evt, pacientes: 9, porPaciente: 5, prefixo: "pag"); // 45 consultas

        var p1 = await Json(await pro.GetAsync("/api/v1/bookings?page=1&pageSize=20"));
        var p2 = await Json(await pro.GetAsync("/api/v1/bookings?page=2&pageSize=20"));
        var p3 = await Json(await pro.GetAsync("/api/v1/bookings?page=3&pageSize=20"));
        Assert.Equal(45, p1.GetProperty("total").GetInt32());
        Assert.Equal(20, p1.GetProperty("items").GetArrayLength());
        Assert.Equal(20, p2.GetProperty("items").GetArrayLength());
        Assert.Equal(5, p3.GetProperty("items").GetArrayLength());
        var uids = new[] { p1, p2, p3 }.SelectMany(p => p.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("uid").GetString())).ToList();
        Assert.Equal(45, uids.Distinct().Count()); // sem repetição entre páginas
        // O título do tipo de consulta chega onde o front espera (eventType.title) — antes vinha como eventTitle e a tela mostrava sempre "Consulta".
        Assert.False(string.IsNullOrEmpty(p1.GetProperty("items")[0].GetProperty("eventType").GetProperty("title").GetString()));

        // pageSize é limitado a 100; page inválida vira 1.
        var enorme = await Json(await pro.GetAsync("/api/v1/bookings?pageSize=100000&page=-3"));
        Assert.Equal(100, enorme.GetProperty("pageSize").GetInt32());
        Assert.Equal(1, enorme.GetProperty("page").GetInt32());

        // Abas: a soma das abas cobre tudo, sem sobreposição.
        var soma = 0;
        foreach (var aba in new[] { "upcoming", "pending", "past", "cancelled" })
            soma += (await Json(await pro.GetAsync($"/api/v1/bookings?scope={aba}&pageSize=100"))).GetProperty("total").GetInt32();
        Assert.Equal(45, soma);

        // Busca por nome/e-mail no servidor.
        var busca = await Json(await pro.GetAsync("/api/v1/bookings?q=pag-0003&pageSize=100"));
        Assert.Equal(5, busca.GetProperty("total").GetInt32());
        var curinga = await Json(await pro.GetAsync("/api/v1/bookings?q=%25"));
        Assert.Equal(0, curinga.GetProperty("total").GetInt32()); // '%' é literal, não curinga

        // Resumo bate com as abas.
        var resumo = await Json(await pro.GetAsync("/api/v1/bookings/summary"));
        Assert.Equal(45, resumo.GetProperty("total").GetInt32());
        Assert.Equal(45, resumo.GetProperty("upcoming").GetInt32() + resumo.GetProperty("pendingApproval").GetInt32()
                          + resumo.GetProperty("past").GetInt32() + resumo.GetProperty("cancelledOrExpired").GetInt32());
        Assert.True(resumo.GetProperty("nextUp").GetArrayLength() <= 5);
    }

    [Fact]
    public async Task Pacientes_paginam_agrupam_e_buscam_no_servidor_sem_vazar_para_outro_profissional()
    {
        var pro = await api.LoginAsync("i2-pac@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-pac");
        await SemeiaAsync(owner, evt, pacientes: 13, porPaciente: 3, prefixo: "pac");

        var p1 = await Json(await pro.GetAsync("/api/v1/patients?page=1&pageSize=5"));
        Assert.Equal(13, p1.GetProperty("total").GetInt32());
        Assert.Equal(5, p1.GetProperty("items").GetArrayLength());
        var p3 = await Json(await pro.GetAsync("/api/v1/patients?page=3&pageSize=5"));
        Assert.Equal(3, p3.GetProperty("items").GetArrayLength());
        var nomes = p1.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("name").GetString()!).ToList();
        Assert.Equal(nomes.OrderBy(n => n, StringComparer.Ordinal), nomes); // A→Z
        Assert.All(p1.GetProperty("items").EnumerateArray(), i =>
            Assert.Equal(3, i.GetProperty("totalBookings").GetInt32() + i.GetProperty("cancelledBookings").GetInt32()));

        // Busca por telefone (parcial) e por e-mail.
        Assert.Equal(1, (await Json(await pro.GetAsync("/api/v1/patients?q=1199000007"))).GetProperty("total").GetInt32());
        Assert.Equal(1, (await Json(await pro.GetAsync("/api/v1/patients?q=pac-0012%40example"))).GetProperty("total").GetInt32());

        var outro = await api.LoginAsync("i2-pac-outro@example.test");
        Assert.Equal(0, (await Json(await outro.GetAsync("/api/v1/patients"))).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Listas_com_10_mil_consultas_respondem_rapido()
    {
        var pro = await api.LoginAsync("i2-perf@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-perf");
        var sw = Stopwatch.StartNew();
        await SemeiaAsync(owner, evt, pacientes: 400, porPaciente: 25, prefixo: "perf"); // 10.000 consultas
        output.WriteLine($"semeadura de 10.000 consultas: {sw.ElapsedMilliseconds} ms");

        async Task<long> Mede(string rota)
        {
            await pro.GetAsync(rota); // aquece (JIT, plano de consulta)
            var tempos = new List<long>();
            for (var i = 0; i < 5; i++)
            {
                sw.Restart();
                var r = await pro.GetAsync(rota);
                tempos.Add(sw.ElapsedMilliseconds);
                Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            }
            tempos.Sort();
            output.WriteLine($"{rota}: mediana {tempos[2]} ms (min {tempos[0]}, máx {tempos[4]})");
            return tempos[2];
        }

        var consultas = await Mede("/api/v1/bookings?page=1&pageSize=20");
        var abaFuturas = await Mede("/api/v1/bookings?scope=upcoming&page=2&pageSize=20");
        var pacientes = await Mede("/api/v1/patients?page=1&pageSize=20");
        var buscaPacientes = await Mede("/api/v1/patients?q=perf-0123");
        var resumo = await Mede("/api/v1/bookings/summary");

        // Meta do plano: < 200 ms. O teste aceita folga (máquina compartilhada com o Docker), mas o número fica no log.
        foreach (var t in new[] { consultas, abaFuturas, pacientes, buscaPacientes, resumo })
            Assert.True(t < 400, $"lista lenta: {t} ms");
    }
}
