namespace MarcaAi.Application.Features.Billing;

/// <summary>
/// Regra do teste grátis (decisão D5): 30 dias, sem cartão, calculado a partir de
/// <c>TrialEndsAt</c> (usuário -> Solo Pro; clínica -> Clínica). A expiração é avaliada em
/// tempo de leitura (sem job): depois do prazo o plano efetivo volta ao Solo (free).
/// </summary>
public static class TrialPolicy
{
    public const int Days = 30;
    public const string UserPlan = PlanCatalog.SoloPro;
    public const string TeamPlan = PlanCatalog.Clinica;

    public static bool IsActive(DateTime? trialEndsAt) => trialEndsAt is { } end && end > DateTime.UtcNow;
}
