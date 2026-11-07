using System.Net;
using System.Net.Http.Json;
using MarcaAi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.IntegrationTests;

[Collection("api")]
public class AuthTests(ApiFixture api)
{
    [Fact]
    public async Task Rotas_protegidas_respondem_401_sem_sessao()
    {
        var http = api.NewClient();
        foreach (var rota in new[] { "/api/v1/auth/me", "/api/v1/teams", "/api/v1/payouts", "/api/v1/bookings" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync(rota)).StatusCode);
    }

    [Fact]
    public async Task Magic_link_vale_uma_vez_so()
    {
        var http = api.NewClient();
        await http.PostAsJsonAsync("/api/v1/auth/magic-link/request", new { email = "it-uso-unico@example.test" });
        var token = await api.WithDbAsync(db => db.VerificationTokens
            .Where(v => v.Identifier == "it-uso-unico@example.test").Select(v => v.Token).FirstAsync());

        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync($"/api/v1/auth/magic-link/verify?token={token}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.GetAsync($"/api/v1/auth/magic-link/verify?token={token}")).StatusCode);
    }

    [Fact]
    public async Task Token_de_outro_fluxo_com_dois_pontos_nao_vale_como_magic_link()
    {
        await api.WithDbAsync(async db =>
        {
            db.VerificationTokens.Add(new VerificationToken
            { Identifier = "gcal:alguem", Token = "tok-outro-fluxo", Expires = DateTime.UtcNow.AddMinutes(10) });
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.BadRequest, (await api.NewClient().GetAsync("/api/v1/auth/magic-link/verify?token=tok-outro-fluxo")).StatusCode);
    }

    [Fact]
    public async Task Sessao_valida_devolve_o_proprio_usuario()
    {
        var u = await api.LoginAsync("it-me@example.test");
        var resp = await u.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("it-me@example.test", await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Email_invalido_no_magic_link_e_rejeitado()
    {
        var resp = await api.NewClient().PostAsJsonAsync("/api/v1/auth/magic-link/request", new { email = "sem-arroba" });
        Assert.True((int)resp.StatusCode is 400 or 422);
    }
}
