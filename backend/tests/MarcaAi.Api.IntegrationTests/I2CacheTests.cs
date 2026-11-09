using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Caching;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>I2: cache de leitura (perfil público e dias livres do mês) — serve do cache e nunca fica velho depois de uma gravação.</summary>
[Collection("api")]
public class I2CacheTests(ApiFixture api)
{
    private IReadCache Cache => api.Services.GetRequiredService<IReadCache>();
    private (long Hits, long Misses) Stats(string area) => Cache.Stats().GetValueOrDefault(area);

    private async Task<JsonElement> PerfilAsync(string username)
    {
        var r = await api.NewClient().GetAsync($"/api/v1/public/{username}");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Perfil_publico_vem_do_cache_e_toda_gravacao_o_invalida_na_hora()
    {
        var pro = await api.LoginAsync("i2-cache-perfil@example.test");
        var (owner, evt, username) = await pro.OnboardAsync("i2-cache-perfil");

        // O OnboardAsync já leu o perfil depois de criar o tipo de consulta (provando a invalidação pelas rotas); agora só lemos.
        var antes = Stats("public-profile");
        for (var i = 0; i < 3; i++) await PerfilAsync(username);
        var depois = Stats("public-profile");
        Assert.Equal(3, depois.Hits - antes.Hits);
        Assert.Equal(0, depois.Misses - antes.Misses);

        // 1) Edição do perfil pela API.
        (await pro.PutAsync("/api/v1/me/profile", new
        {
            name = "Dra Cache", username, timeZone = "America/Sao_Paulo", bio = "bio nova", theme = "LIGHT", brandColor = (string?)null,
            specialty = (string?)null, council = (string?)null, registrationNumber = (string?)null, clinicName = (string?)null,
        })).EnsureSuccessStatusCode();
        var p1 = await PerfilAsync(username);
        Assert.Equal("bio nova", p1.GetProperty("bio").GetString());

        // 2) Novo tipo de consulta pela API aparece na hora.
        (await pro.PostAsync("/api/v1/event-types", new
        {
            title = "Retorno", slug = "retorno", duration = 20, locationType = "IN_PERSON", requiresConfirm = false,
            beforeEventBuffer = 0, afterEventBuffer = 0, bookingLimitDays = 60, locationValue = "Rua X", price = (int?)null,
            questions = Array.Empty<object>(),
        })).EnsureSuccessStatusCode();
        Assert.Equal(2, (await PerfilAsync(username)).GetProperty("eventTypes").GetArrayLength());

        // 3) Gravação feita direto no banco (qualquer caminho de escrita, não só controllers): desativa o tipo original.
        await api.WithDbAsync(async db =>
        {
            var e = await db.EventTypes.FirstAsync(x => x.Id == evt);
            e.IsActive = false;
            await db.SaveChangesAsync();
        });
        var p3 = await PerfilAsync(username);
        Assert.Equal(1, p3.GetProperty("eventTypes").GetArrayLength());
        Assert.NotEqual(evt, p3.GetProperty("eventTypes")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Perfil_inexistente_nao_e_guardado_no_cache()
    {
        var username = "i2-cache-novo";
        Assert.Equal(HttpStatusCode.NotFound, (await api.NewClient().GetAsync($"/api/v1/public/{username}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.NewClient().GetAsync($"/api/v1/public/{username}")).StatusCode);

        var pro = await api.LoginAsync("i2-cache-novo@example.test");
        await pro.OnboardAsync(username);
        await PerfilAsync(username); // aparece de imediato: o 404 anterior não ficou preso
    }

    [Fact]
    public async Task Dias_livres_do_mes_vem_do_cache_e_uma_excecao_na_agenda_o_atualiza()
    {
        var pro = await api.LoginAsync("i2-cache-mes@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-cache-mes");
        var mes = DateTime.UtcNow.AddMonths(1).ToString("yyyy-MM");
        var url = $"/api/v1/slots/month?ownerId={owner}&eventTypeId={evt}&month={mes}&tz=America/Sao_Paulo";

        async Task<string[]> Dias() =>
            (await api.NewClient().GetFromJsonAsync<JsonElement>(url)).GetProperty("days").EnumerateArray().Select(d => d.GetString()!).ToArray();

        var antes = Stats("slots-month");
        var primeira = await Dias();   // miss
        var segunda = await Dias();    // hit
        var depois = Stats("slots-month");
        Assert.NotEmpty(primeira);
        Assert.Equal(primeira, segunda);
        Assert.Equal(1, depois.Hits - antes.Hits);
        Assert.Equal(1, depois.Misses - antes.Misses);

        // Bloqueia um dia que estava livre (gravação direta): a próxima leitura já não o traz.
        var dia = DateOnly.ParseExact(primeira[0], "yyyy-MM-dd");
        await api.WithDbAsync(async db =>
        {
            var schedule = await db.Schedules.FirstAsync(s => s.UserId == owner);
            db.ScheduleExceptions.Add(new ScheduleException { ScheduleId = schedule.Id, UserId = owner, Date = dia, Type = ExceptionType.BLOCKED, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        var nova = await Dias();
        Assert.DoesNotContain(primeira[0], nova);
        Assert.Equal(primeira.Length - 1, nova.Length);

        // Outro profissional não é afetado (escopo por profissional): a leitura dele continua um acerto.
        var outro = await api.LoginAsync("i2-cache-mes-b@example.test");
        var (ownerB, evtB, _) = await outro.OnboardAsync("i2-cache-mes-b");
        var urlB = $"/api/v1/slots/month?ownerId={ownerB}&eventTypeId={evtB}&month={mes}&tz=America/Sao_Paulo";
        await api.NewClient().GetAsync(urlB);
        var b0 = Stats("slots-month");
        await api.WithDbAsync(async db =>
        {
            var schedule = await db.Schedules.FirstAsync(s => s.UserId == owner);
            db.ScheduleExceptions.Add(new ScheduleException { ScheduleId = schedule.Id, UserId = owner, Date = dia.AddDays(1), Type = ExceptionType.BLOCKED, CreatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        await api.NewClient().GetAsync(urlB);
        Assert.Equal(1, Stats("slots-month").Hits - b0.Hits);
    }

    [Fact]
    public async Task Dentro_de_uma_transacao_a_invalidacao_so_vale_depois_do_commit()
    {
        var pro = await api.LoginAsync("i2-cache-tx@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-cache-tx");
        var chamadas = 0;
        Task<int> Calcula() { chamadas++; return Task.FromResult(chamadas); }
        Task<int> Le() => Cache.GetOrCreateAsync("teste-tx", owner, "k", TimeSpan.FromMinutes(1), Calcula);

        Assert.Equal(1, await Le());
        Assert.Equal(1, await Le()); // do cache

        await api.WithDbAsync(async db =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var e = await db.EventTypes.FirstAsync(x => x.Id == evt);
            e.Description = "alterada na transação";
            await db.SaveChangesAsync();
            // Salvou mas NÃO confirmou: o cache ainda não pode ter sido invalidado (senão um leitor re-guardaria o dado antigo).
            Assert.Equal(1, await Le());
            await tx.CommitAsync();
        });
        Assert.Equal(2, await Le()); // confirmado: invalidou
    }

    [Fact]
    public async Task Transacao_desfeita_nao_invalida()
    {
        var pro = await api.LoginAsync("i2-cache-rb@example.test");
        var (owner, evt, _) = await pro.OnboardAsync("i2-cache-rb");
        var chamadas = 0;
        Task<int> Le() => Cache.GetOrCreateAsync("teste-rb", owner, "k", TimeSpan.FromMinutes(1), () => Task.FromResult(++chamadas));
        Assert.Equal(1, await Le());

        await api.WithDbAsync(async db =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            (await db.EventTypes.FirstAsync(x => x.Id == evt)).Description = "vai desfazer";
            await db.SaveChangesAsync();
            await tx.RollbackAsync();
        });
        Assert.Equal(1, await Le());
    }

    // ── ReadCache (unidade) ────────────────────────────────────────────────
    [Fact]
    public async Task ReadCache_respeita_ttl_versao_escopo_shouldCache_e_limite()
    {
        using var c = new ReadCache();
        var n = 0;
        Task<int> F() => Task.FromResult(++n);

        Assert.Equal(1, await c.GetOrCreateAsync("a", "u1", "k", TimeSpan.FromMinutes(1), F));
        Assert.Equal(1, await c.GetOrCreateAsync("a", "u1", "k", TimeSpan.FromMinutes(1), F));           // hit
        Assert.Equal(2, await c.GetOrCreateAsync("a", "u2", "k", TimeSpan.FromMinutes(1), F));           // outro escopo
        c.Invalidate("u1");
        Assert.Equal(3, await c.GetOrCreateAsync("a", "u1", "k", TimeSpan.FromMinutes(1), F));           // versão nova
        Assert.Equal(2, await c.GetOrCreateAsync("a", "u2", "k", TimeSpan.FromMinutes(1), F));           // u2 intacto
        c.InvalidateAll();
        Assert.Equal(4, await c.GetOrCreateAsync("a", "u2", "k", TimeSpan.FromMinutes(1), F));

        // shouldCache=false: não guarda.
        var m = 0;
        Assert.Equal(1, await c.GetOrCreateAsync<int?>("b", "u", "k", TimeSpan.FromMinutes(1), () => Task.FromResult<int?>(++m), v => false));
        Assert.Equal(2, await c.GetOrCreateAsync<int?>("b", "u", "k", TimeSpan.FromMinutes(1), () => Task.FromResult<int?>(++m), v => false));

        // TTL.
        var t = 0;
        Assert.Equal(1, await c.GetOrCreateAsync("c", "u", "k", TimeSpan.FromMilliseconds(50), () => Task.FromResult(++t)));
        await Task.Delay(120);
        Assert.Equal(2, await c.GetOrCreateAsync("c", "u", "k", TimeSpan.FromMilliseconds(50), () => Task.FromResult(++t)));

        // Estatísticas.
        var s = c.Stats()["a"];
        Assert.Equal(2, s.Hits);
        Assert.Equal(4, s.Misses);

        // Limite de entradas: encher além do máximo não explode nem cresce sem fim.
        for (var i = 0; i < ReadCache.MaxEntries + 500; i++)
            await c.GetOrCreateAsync("cheio", "u", $"k{i}", TimeSpan.FromMinutes(5), () => Task.FromResult(i));
        Assert.True(c.Stats()["cheio"].Misses == ReadCache.MaxEntries + 500);
    }
}
