using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Billing;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Infrastructure.Billing;

/// <summary>
/// Enforcement de features premium por plano efetivo (Q7). Só planos com assinatura **viva**
/// (active/trialing) concedem recursos; sem assinatura → Solo free (nenhum premium).
/// </summary>
public sealed class PlanAccessService(IApplicationDbContext db) : IPlanAccessService
{
    public async Task<bool> UserHasFeatureAsync(string userId, string feature, CancellationToken ct = default)
    {
        // 1) Assinatura individual ativa.
        var us = await db.UserSubscriptions.AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new { s.Status, s.PlanCode })
            .FirstOrDefaultAsync(ct);
        if (IsLive(us?.Status) && PlanCatalog.HasFeature(us!.PlanCode, feature)) return true;

        // 1b) Trial interno de 30 dias (D5): concede o plano Solo Pro enquanto não expira.
        var userTrial = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId).Select(u => u.TrialEndsAt).FirstOrDefaultAsync(ct);
        if (TrialPolicy.IsActive(userTrial) && PlanCatalog.HasFeature(TrialPolicy.UserPlan, feature)) return true;

        // 2) Fallback: alguma clínica ativa a que o usuário pertence oferece o recurso.
        var teamIds = await db.TeamMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .Select(m => m.TeamId)
            .ToListAsync(ct);
        if (teamIds.Count == 0) return false;

        var subs = await db.Subscriptions.AsNoTracking()
            .Where(s => teamIds.Contains(s.TeamId))
            .Select(s => new { s.Status, s.PlanCode })
            .ToListAsync(ct);
        if (subs.Any(s => IsLive(s.Status) && PlanCatalog.HasFeature(s.PlanCode, feature))) return true;

        var teamTrials = await db.Teams.AsNoTracking()
            .Where(t => teamIds.Contains(t.Id)).Select(t => t.TrialEndsAt).ToListAsync(ct);
        return teamTrials.Any(TrialPolicy.IsActive) && PlanCatalog.HasFeature(TrialPolicy.TeamPlan, feature);
    }

    public async Task<bool> TeamHasFeatureAsync(string teamId, string feature, CancellationToken ct = default)
    {
        var s = await db.Subscriptions.AsNoTracking()
            .Where(x => x.TeamId == teamId)
            .Select(x => new { x.Status, x.PlanCode })
            .FirstOrDefaultAsync(ct);
        if (IsLive(s?.Status) && PlanCatalog.HasFeature(s!.PlanCode, feature)) return true;

        var trial = await db.Teams.AsNoTracking()
            .Where(t => t.Id == teamId).Select(t => t.TrialEndsAt).FirstOrDefaultAsync(ct);
        return TrialPolicy.IsActive(trial) && PlanCatalog.HasFeature(TrialPolicy.TeamPlan, feature);
    }

    private static bool IsLive(string? status) =>
        (status ?? "").Trim().ToLowerInvariant() is "active" or "trialing";
}
