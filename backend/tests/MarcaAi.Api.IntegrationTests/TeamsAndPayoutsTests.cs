using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>RBAC de times (OWNER/ADMIN/MEMBER) e regressão do IDOR de payouts (achado da F3).</summary>
[Collection("api")]
public class TeamsAndPayoutsTests(ApiFixture api)
{
    private sealed record Clinica(string TeamId, TestUser Dono, TestUser Admin, TestUser Membro, TestUser Estranho);

    private async Task<Clinica> NovaClinicaAsync(string prefixo)
    {
        var dono = await api.LoginAsync($"{prefixo}-dono@example.test");
        var admin = await api.LoginAsync($"{prefixo}-admin@example.test");
        var membro = await api.LoginAsync($"{prefixo}-membro@example.test");
        var estranho = await api.LoginAsync($"{prefixo}-estranho@example.test");

        var teamId = Guid.NewGuid().ToString("N");
        await api.WithDbAsync(async db =>
        {
            var agora = DateTime.UtcNow;
            db.Teams.Add(new Team { Id = teamId, Name = "Clínica " + prefixo, Slug = "clinica-" + prefixo, CreatedAt = agora, UpdatedAt = agora });
            foreach (var (u, r) in new[] { (dono, TeamRole.OWNER), (admin, TeamRole.ADMIN), (membro, TeamRole.MEMBER) })
                db.TeamMembers.Add(new TeamMember { Id = Guid.NewGuid().ToString("N"), TeamId = teamId, UserId = u.Id, Role = r, CreatedAt = agora, UpdatedAt = agora });
            await db.SaveChangesAsync();
        });
        return new Clinica(teamId, dono, admin, membro, estranho);
    }

    private async Task<string> ContaStripeAsync(PayoutOwnerType tipo, string ownerId)
    {
        var id = Guid.NewGuid().ToString("N");
        await api.WithDbAsync(async db =>
        {
            db.PayoutAccounts.Add(new PayoutAccount
            {
                Id = id, OwnerType = tipo, OwnerId = ownerId, Provider = PaymentProvider.STRIPE,
                ExternalAccountId = "acct_" + id[..10], Status = PayoutAccountStatus.ACTIVE,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        });
        return id;
    }

    // ---------- Times ----------

    [Fact]
    public async Task Quem_nao_e_membro_nao_enxerga_o_time()
    {
        var c = await NovaClinicaAsync("t-ver");

        Assert.Equal(HttpStatusCode.OK, (await c.Membro.GetAsync($"/api/v1/teams/{c.TeamId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Estranho.GetAsync($"/api/v1/teams/{c.TeamId}")).StatusCode);
    }

    [Fact]
    public async Task Membro_comum_nao_pode_convidar_mas_admin_pode()
    {
        var c = await NovaClinicaAsync("t-conv");
        var alvo = await api.LoginAsync("t-conv-alvo@example.test");

        var porMembro = await c.Membro.PostAsync($"/api/v1/teams/{c.TeamId}/members", new { email = alvo.Email, role = "MEMBER" });
        var porAdmin = await c.Admin.PostAsync($"/api/v1/teams/{c.TeamId}/members", new { email = alvo.Email, role = "MEMBER" });
        var porEstranho = await c.Estranho.PostAsync($"/api/v1/teams/{c.TeamId}/members", new { email = alvo.Email, role = "MEMBER" });

        Assert.Equal(HttpStatusCode.Forbidden, porMembro.StatusCode);
        Assert.Equal(HttpStatusCode.OK, porAdmin.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, porEstranho.StatusCode);
    }

    [Fact]
    public async Task Papel_do_dono_nao_pode_ser_alterado_e_ninguem_muda_o_proprio_papel()
    {
        var c = await NovaClinicaAsync("t-papel");

        var mexerNoDono = await c.Admin.PutAsync($"/api/v1/teams/{c.TeamId}/members/{c.Dono.Id}", new { role = "MEMBER" });
        var mexerEmSi = await c.Admin.PutAsync($"/api/v1/teams/{c.TeamId}/members/{c.Admin.Id}", new { role = "MEMBER" });
        var membroTentando = await c.Membro.PutAsync($"/api/v1/teams/{c.TeamId}/members/{c.Admin.Id}", new { role = "MEMBER" });
        var promover = await c.Dono.PutAsync($"/api/v1/teams/{c.TeamId}/members/{c.Membro.Id}", new { role = "ADMIN" });

        Assert.Equal(HttpStatusCode.Conflict, mexerNoDono.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, mexerEmSi.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, membroTentando.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, promover.StatusCode);
    }

    [Fact]
    public async Task Remocao_respeita_hierarquia_e_nao_deixa_o_time_sem_dono()
    {
        var c = await NovaClinicaAsync("t-rem");

        Assert.Equal(HttpStatusCode.Forbidden, (await c.Membro.DeleteAsync($"/api/v1/teams/{c.TeamId}/members/{c.Admin.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Admin.DeleteAsync($"/api/v1/teams/{c.TeamId}/members/{c.Dono.Id}")).StatusCode);
        // O único dono não consegue se remover.
        Assert.NotEqual(HttpStatusCode.NoContent, (await c.Dono.DeleteAsync($"/api/v1/teams/{c.TeamId}/members/{c.Dono.Id}")).StatusCode);
        // Admin remove membro comum.
        Assert.Equal(HttpStatusCode.NoContent, (await c.Admin.DeleteAsync($"/api/v1/teams/{c.TeamId}/members/{c.Membro.Id}")).StatusCode);

        var restantes = await api.WithDbAsync(db => db.TeamMembers.CountAsync(m => m.TeamId == c.TeamId && m.Role == TeamRole.OWNER));
        Assert.Equal(1, restantes);
    }

    // ---------- Payouts (IDOR) ----------

    [Fact]
    public async Task Usuario_nao_desconecta_a_conta_de_recebimento_de_outro_usuario()
    {
        var vitima = await api.LoginAsync("p-vitima@example.test");
        var atacante = await api.LoginAsync("p-atacante@example.test");
        var conta = await ContaStripeAsync(PayoutOwnerType.USER, vitima.Id);

        var resp = await atacante.DeleteAsync($"/api/v1/payouts/{conta}");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode); // não revela que o id existe
        var status = await api.WithDbAsync(db => db.PayoutAccounts.Where(a => a.Id == conta).Select(a => a.Status).SingleAsync());
        Assert.Equal(PayoutAccountStatus.ACTIVE, status);
    }

    [Fact]
    public async Task Conta_inexistente_e_conta_alheia_respondem_igual()
    {
        var u = await api.LoginAsync("p-igual@example.test");
        var outro = await api.LoginAsync("p-igual-outro@example.test");
        var alheia = await ContaStripeAsync(PayoutOwnerType.USER, outro.Id);

        var a = await u.DeleteAsync($"/api/v1/payouts/{alheia}");
        var b = await u.DeleteAsync("/api/v1/payouts/id-que-nao-existe");

        Assert.Equal(a.StatusCode, b.StatusCode);
    }

    [Fact]
    public async Task Conta_de_clinica_so_e_desconectada_por_dono_ou_admin()
    {
        var c = await NovaClinicaAsync("p-clin");
        var conta = await ContaStripeAsync(PayoutOwnerType.TEAM, c.TeamId);

        Assert.Equal(HttpStatusCode.NotFound, (await c.Estranho.DeleteAsync($"/api/v1/payouts/{conta}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.Membro.DeleteAsync($"/api/v1/payouts/{conta}")).StatusCode);

        var intacta = await api.WithDbAsync(db => db.PayoutAccounts.Where(a => a.Id == conta).Select(a => a.Status).SingleAsync());
        Assert.Equal(PayoutAccountStatus.ACTIVE, intacta);

        Assert.Equal(HttpStatusCode.NoContent, (await c.Admin.DeleteAsync($"/api/v1/payouts/{conta}")).StatusCode);
    }

    [Fact]
    public async Task Listagem_de_recebimentos_da_clinica_e_so_para_gestores()
    {
        var c = await NovaClinicaAsync("p-lista");
        await ContaStripeAsync(PayoutOwnerType.TEAM, c.TeamId);

        Assert.Equal(HttpStatusCode.Forbidden, (await c.Estranho.GetAsync($"/api/v1/payouts/teams/{c.TeamId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.Membro.GetAsync($"/api/v1/payouts/teams/{c.TeamId}")).StatusCode);

        var ok = await c.Dono.GetAsync($"/api/v1/payouts/teams/{c.TeamId}");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(1, (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetArrayLength());
    }
}
