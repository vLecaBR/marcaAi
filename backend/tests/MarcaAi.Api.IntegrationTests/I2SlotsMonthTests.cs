using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I2: o cálculo do mês (uma carga só) tem de dar exatamente o mesmo resultado que consultar dia a dia.</summary>
[Collection("api")]
public class I2SlotsMonthTests(ApiFixture api)
{
    [Fact]
    public async Task Dias_do_mes_equivalem_a_consultar_cada_dia_inclusive_com_consulta_marcada_e_excecao()
    {
        var pro = await api.LoginAsync("i2-mes-eq@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-mes-eq");
        var tz = "America/Sao_Paulo";
        var http = api.NewClient();

        // Mês que vem. Bloqueia um dia útil por exceção e ocupa TODOS os horários de outro dia com consultas.
        var primeiro = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1).AddMonths(1);
        var mes = primeiro.ToString("yyyy-MM");
        var uteis = Enumerable.Range(0, 28).Select(i => primeiro.AddDays(i)).Where(d => d.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)).ToList();
        var bloqueado = uteis[2];
        var lotado = uteis[4];

        await api.WithDbAsync(async db =>
        {
            var schedule = await db.Schedules.FirstAsync(s => s.UserId == owner);
            db.ScheduleExceptions.Add(new ScheduleException { ScheduleId = schedule.Id, UserId = owner, Date = bloqueado, Type = ExceptionType.BLOCKED, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        var slotsLotado = (await http.GetFromJsonAsync<JsonElement>($"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={lotado:yyyy-MM-dd}&tz={tz}"))
            .GetProperty("slots").EnumerateArray().ToList();
        Assert.NotEmpty(slotsLotado);
        await api.WithDbAsync(async db =>
        {
            foreach (var s in slotsLotado)
            {
                var ini = s.GetProperty("startUtc").GetDateTime().ToUniversalTime();
                db.Bookings.Add(new Booking { UserId = owner, EventTypeId = evt, GuestName = "Ocupa", GuestEmail = "ocupa@example.test", StartTime = ini, EndTime = ini.AddMinutes(30),
                    GuestTimeZone = tz, Status = BookingStatus.CONFIRMED, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow });
            }
            await db.SaveChangesAsync();
        });

        var doMes = (await http.GetFromJsonAsync<JsonElement>($"/api/v1/slots/month?ownerId={owner}&eventTypeId={evt}&month={mes}&tz={tz}"))
            .GetProperty("days").EnumerateArray().Select(d => d.GetString()!).ToHashSet();

        var diaADia = new HashSet<string>();
        for (var d = primeiro; d.Month == primeiro.Month; d = d.AddDays(1))
        {
            var n = (await http.GetFromJsonAsync<JsonElement>($"/api/v1/slots?ownerId={owner}&eventTypeId={evt}&date={d:yyyy-MM-dd}&tz={tz}")).GetProperty("slots").GetArrayLength();
            if (n > 0) diaADia.Add(d.ToString("yyyy-MM-dd"));
        }

        Assert.Equal(diaADia.OrderBy(x => x), doMes.OrderBy(x => x));
        Assert.DoesNotContain(bloqueado.ToString("yyyy-MM-dd"), doMes);
        Assert.DoesNotContain(lotado.ToString("yyyy-MM-dd"), doMes);
        Assert.NotEmpty(doMes);
    }
}
