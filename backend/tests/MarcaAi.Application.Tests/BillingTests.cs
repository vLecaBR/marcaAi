using MarcaAi.Application.Features.Billing;

namespace MarcaAi.Application.Tests;

/// <summary>PlanCatalog, BillingStatusMapper e TrialPolicy.</summary>
public class BillingTests
{
    [Theory]
    [InlineData("SOLO", 1000)]
    [InlineData("SOLO_PRO", 500)]
    [InlineData("CLINICA", 249)]
    [InlineData("CLINICA_PRO", 199)]
    [InlineData("clinica_pro", 199)]
    [InlineData("  solo_pro ", 500)]
    [InlineData(null, 1000)]
    [InlineData("PLANO_INEXISTENTE", 1000)]
    public void FeeBpsFor_segue_a_escada_de_taxas_e_cai_no_Solo(string? plano, int esperado) =>
        Assert.Equal(esperado, PlanCatalog.FeeBpsFor(plano));

    [Fact]
    public void Taxa_diminui_conforme_o_plano_sobe() =>
        Assert.True(PlanCatalog.SoloFeeBps > PlanCatalog.SoloProFeeBps
                    && PlanCatalog.SoloProFeeBps > PlanCatalog.ClinicaFeeBps
                    && PlanCatalog.ClinicaFeeBps > PlanCatalog.ClinicaProFeeBps);

    [Theory]
    [InlineData("SOLO", false, false)]
    [InlineData("SOLO_PRO", false, true)]
    [InlineData("CLINICA", true, true)]
    [InlineData("CLINICA_PRO", true, true)]
    [InlineData(null, false, false)]
    public void IsClinicPlan_e_IsPaid(string? plano, bool clinica, bool pago)
    {
        Assert.Equal(clinica, PlanCatalog.IsClinicPlan(plano));
        Assert.Equal(pago, PlanCatalog.IsPaid(plano));
    }

    [Fact]
    public void Limites_do_Solo_free_sao_restritos_e_os_pagos_sao_mais_amplos()
    {
        var solo = PlanCatalog.LimitsFor("SOLO");
        Assert.Equal(50, solo.MaxBookingsPerMonth);
        Assert.Equal(1, solo.MaxMembers);
        Assert.Equal(3, solo.MaxEventTypes);

        var pro = PlanCatalog.LimitsFor("CLINICA_PRO");
        Assert.Null(pro.MaxBookingsPerMonth);
        Assert.Null(pro.MaxMembers);
        Assert.Null(pro.MaxEventTypes);
        Assert.Equal(5, PlanCatalog.LimitsFor("CLINICA").MaxMembers);
    }

    [Theory]
    [InlineData("SOLO", "whatsapp_reminders", false)]
    [InlineData("SOLO_PRO", "whatsapp_reminders", true)]
    [InlineData("SOLO_PRO", "team_finance", false)]
    [InlineData("CLINICA", "team_finance", true)]
    [InlineData("CLINICA", "advanced_reports", false)]
    [InlineData("CLINICA_PRO", "advanced_reports", true)]
    public void HasFeature_depende_do_plano(string plano, string feature, bool esperado) =>
        Assert.Equal(esperado, PlanCatalog.HasFeature(plano, feature));

    [Theory]
    [InlineData("trialing", "TRIALING")]
    [InlineData("ACTIVE", "ACTIVE")]
    [InlineData(" past_due ", "PAST_DUE")]
    [InlineData("canceled", "CANCELED")]
    [InlineData("cancelled", "CANCELED")]
    [InlineData("incomplete", "INACTIVE")]
    [InlineData("", "INACTIVE")]
    [InlineData(null, "INACTIVE")]
    public void MapStatus_normaliza_o_status_do_provedor(string? bruto, string esperado) =>
        Assert.Equal(esperado, BillingStatusMapper.MapStatus(bruto));

    [Theory]
    [InlineData("active", "CLINICA", "CLINICA", true)]
    [InlineData("trialing", "solo_pro", "SOLO_PRO", true)]
    [InlineData("past_due", "CLINICA_PRO", "SOLO", false)]   // assinatura inviva não concede premium
    [InlineData("canceled", "CLINICA", "SOLO", false)]
    [InlineData("active", null, "SOLO", true)]
    [InlineData("active", "  ", "SOLO", true)]
    public void Effective_so_vale_para_assinatura_viva(string status, string? plano, string planoEsperado, bool vivo)
    {
        var (plan, active) = BillingStatusMapper.Effective(status, plano);
        Assert.Equal(planoEsperado, plan);
        Assert.Equal(vivo, active);
    }

    [Fact]
    public void Trial_interno_ativo_concede_o_plano_do_trial_sem_assinatura()
    {
        var (plan, active, status) = BillingStatusMapper.EffectiveWithTrial(null, null, DateTime.UtcNow.AddDays(5), PlanCatalog.SoloPro);
        Assert.Equal("SOLO_PRO", plan);
        Assert.True(active);
        Assert.Equal("TRIALING", status);
    }

    [Fact]
    public void Trial_expirado_volta_para_o_Solo()
    {
        var (plan, active, status) = BillingStatusMapper.EffectiveWithTrial(null, null, DateTime.UtcNow.AddDays(-1), PlanCatalog.SoloPro);
        Assert.Equal("SOLO", plan);
        Assert.False(active);
        Assert.Equal("INACTIVE", status);
    }

    [Fact]
    public void Assinatura_viva_vence_o_trial()
    {
        var (plan, active, status) = BillingStatusMapper.EffectiveWithTrial("active", "CLINICA", DateTime.UtcNow.AddDays(5), PlanCatalog.SoloPro);
        Assert.Equal("CLINICA", plan);
        Assert.True(active);
        Assert.Equal("ACTIVE", status);
    }

    [Fact]
    public void Trial_calcula_dias_restantes_arredondando_para_cima()
    {
        var estado = BillingStatusMapper.Trial(null, DateTime.UtcNow.AddDays(2).AddHours(1));
        Assert.True(estado.IsTrialing);
        Assert.Equal(3, estado.DaysRemaining);
    }

    [Fact]
    public void Sem_trial_o_estado_vem_vazio()
    {
        var estado = BillingStatusMapper.Trial("active", null);
        Assert.False(estado.IsTrialing);
        Assert.Null(estado.DaysRemaining);
    }

    [Fact]
    public void TrialPolicy_considera_ativo_somente_no_futuro()
    {
        Assert.True(TrialPolicy.IsActive(DateTime.UtcNow.AddMinutes(1)));
        Assert.False(TrialPolicy.IsActive(DateTime.UtcNow.AddMinutes(-1)));
        Assert.False(TrialPolicy.IsActive(null));
    }
}
