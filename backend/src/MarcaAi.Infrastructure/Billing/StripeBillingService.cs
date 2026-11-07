using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Billing;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Stripe;
using Stripe.Checkout;

namespace MarcaAi.Infrastructure.Billing;

/// <summary>
/// Assinatura das clínicas via Stripe: checkout (nova) / portal (existente) + processamento de webhook.
/// Foca no status da assinatura (o que gate features); o período é opcional e best-effort.
/// </summary>
public sealed class StripeBillingService(
    ApplicationDbContext db, IConfiguration config, ILogger<StripeBillingService> logger,
    IWebhookEventStore events) : IBillingService
{
    private string AppUrl => (config["App:PublicUrl"] ?? "http://localhost:3000").TrimEnd('/');
    private void EnsureKey() => StripeConfiguration.ApiKey = config["Stripe:SecretKey"];

    public async Task<CheckoutResult> CreateCheckoutAsync(string teamId, string userId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(config["Stripe:SecretKey"]))
            return new CheckoutResult(false, Error: "Stripe não configurado.", StatusCode: 503);

        var member = await db.TeamMembers.FirstOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, ct);
        if (member is null) return new CheckoutResult(false, Error: "Equipe não encontrada.", StatusCode: 404);
        if (member.Role != TeamRole.OWNER) return new CheckoutResult(false, Error: "Apenas o dono da clínica pode assinar.", StatusCode: 403);

        var subscription = await db.Subscriptions.FirstOrDefaultAsync(s => s.TeamId == teamId, ct);
        EnsureKey();

        try
        {
            // Já é cliente → abre o portal de gerenciamento.
            if (!string.IsNullOrWhiteSpace(subscription?.StripeCustomerId))
            {
                var portal = await new Stripe.BillingPortal.SessionService().CreateAsync(
                    new Stripe.BillingPortal.SessionCreateOptions
                    {
                        Customer = subscription!.StripeCustomerId,
                        ReturnUrl = $"{AppUrl}/dashboard/teams/{teamId}/billing",
                    }, cancellationToken: ct);
                return new CheckoutResult(true, portal.Url);
            }

            // Nova assinatura → checkout.
            var session = await new SessionService().CreateAsync(new SessionCreateOptions
            {
                Mode = "subscription",
                LineItems = new List<SessionLineItemOptions>
                {
                    new() { Price = config["Stripe:PriceId"], Quantity = 1 },
                },
                SuccessUrl = $"{AppUrl}/dashboard/teams/{teamId}/billing?success=true",
                CancelUrl = $"{AppUrl}/dashboard/teams/{teamId}/billing?canceled=true",
                Metadata = new Dictionary<string, string> { ["teamId"] = teamId },
            }, cancellationToken: ct);

            return new CheckoutResult(true, session.Url);
        }
        catch (StripeException ex)
        {
            logger.LogError(ex, "[Stripe] Falha ao criar checkout");
            return new CheckoutResult(false, Error: "Falha ao iniciar o pagamento.", StatusCode: 502);
        }
    }

    public async Task<BillingStatusDto?> GetStatusAsync(string teamId, string userId, CancellationToken ct = default)
    {
        var member = await db.TeamMembers.AsNoTracking()
            .FirstOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, ct);
        if (member is null) return null;

        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.TeamId == teamId, ct);
        var teamTrialEnds = await db.Teams.AsNoTracking()
            .Where(t => t.Id == teamId).Select(t => t.TrialEndsAt).FirstOrDefaultAsync(ct);
        var (planCode, active, status) = BillingStatusMapper.EffectiveWithTrial(
            sub?.Status, sub?.PlanCode, teamTrialEnds, TrialPolicy.TeamPlan);

        // Uso real da clínica no mês corrente.
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);
        var teamEventTypeIds = db.EventTypes.Where(e => e.TeamId == teamId).Select(e => e.Id);
        var bookings = await db.Bookings.CountAsync(
            b => teamEventTypeIds.Contains(b.EventTypeId) && b.StartTime >= monthStart && b.StartTime < monthEnd, ct);
        var members = await db.TeamMembers.CountAsync(m => m.TeamId == teamId, ct);
        var eventTypes = await db.EventTypes.CountAsync(e => e.TeamId == teamId, ct);

        var dto = new BillingStatusDto(
            TeamId: teamId,
            PlanCode: planCode,
            Status: status,
            Active: active,
            CurrentPeriodEnd: sub?.StripeCurrentPeriodEnd,
            Trial: BillingStatusMapper.Trial(status == "TRIALING" ? "trialing" : sub?.Status, teamTrialEnds),
            Usage: new PlanUsageDto(bookings, members, eventTypes),
            Limits: BillingStatusMapper.Limits(planCode));
        return dto;
    }

    public async Task HandleWebhookAsync(string payload, string signature, CancellationToken ct = default)
    {
        var secret = config["Stripe:WebhookSecret"];
        if (string.IsNullOrWhiteSpace(secret)) { logger.LogError("[Stripe] WebhookSecret ausente."); throw new InvalidOperationException("Webhook não configurado."); }

        Event e;
        try { e = EventUtility.ConstructEvent(payload, signature, secret); }
        catch (StripeException ex) { logger.LogWarning(ex, "[Stripe] Assinatura de webhook inválida"); throw; }

        EnsureKey();

        // Idempotência: evento já processado com sucesso → 2xx sem reprocessar.
        if (await events.WasProcessedAsync("stripe-billing", e.Id, ct)) return;

        switch (e.Type)
        {
            case "checkout.session.completed":
            {
                if (e.Data.Object is not Session session || session.SubscriptionId is null) break;
                var sub = await new SubscriptionService().GetAsync(session.SubscriptionId, cancellationToken: ct);
                // Metadata roteia clínica (teamId) vs indivíduo (userId).
                if (session.Metadata is not null && session.Metadata.TryGetValue("teamId", out var teamId) && !string.IsNullOrEmpty(teamId))
                    await UpsertAsync(teamId, sub, ct);
                else if (session.Metadata is not null && session.Metadata.TryGetValue("userId", out var userId) && !string.IsNullOrEmpty(userId))
                    await UpsertUserAsync(userId, sub, ct);
                break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            {
                if (e.Data.Object is not Subscription sub) break;
                var priceId = FirstPriceId(sub);
                var existing = await db.Subscriptions.FirstOrDefaultAsync(s => s.StripeSubscriptionId == sub.Id, ct);
                if (existing is not null)
                {
                    existing.Status = sub.Status;
                    existing.StripePriceId = priceId ?? existing.StripePriceId;
                    ApplyPlan(existing, priceId, sub);
                    await db.SaveChangesAsync(ct);
                    break;
                }
                var existingUser = await db.UserSubscriptions.FirstOrDefaultAsync(s => s.StripeSubscriptionId == sub.Id, ct);
                if (existingUser is not null)
                {
                    existingUser.Status = sub.Status;
                    existingUser.StripePriceId = priceId ?? existingUser.StripePriceId;
                    ApplyUserPlan(existingUser, priceId);
                    await db.SaveChangesAsync(ct);
                }
                break;
            }
        }

        await events.MarkProcessedAsync("stripe-billing", e.Id, ct);
    }

    private async Task UpsertAsync(string teamId, Subscription sub, CancellationToken ct)
    {
        var existing = await db.Subscriptions.FirstOrDefaultAsync(s => s.TeamId == teamId, ct);
        var customerId = sub.CustomerId ?? "";
        var priceId = FirstPriceId(sub);

        if (existing is null)
        {
            var created = new Domain.Entities.Subscription
            {
                TeamId = teamId,
                StripeCustomerId = customerId,
                StripeSubscriptionId = sub.Id,
                StripePriceId = priceId,
                Status = sub.Status,
            };
            ApplyPlan(created, priceId, sub);
            db.Subscriptions.Add(created);
        }
        else
        {
            if (!string.IsNullOrEmpty(customerId)) existing.StripeCustomerId = customerId;
            existing.StripeSubscriptionId = sub.Id;
            existing.StripePriceId = priceId;
            existing.Status = sub.Status;
            ApplyPlan(existing, priceId, sub);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Upsert da assinatura **individual** (Solo Pro) a partir do webhook. Ver Q7.</summary>
    private async Task UpsertUserAsync(string userId, Subscription sub, CancellationToken ct)
    {
        var existing = await db.UserSubscriptions.FirstOrDefaultAsync(s => s.UserId == userId, ct);
        var customerId = sub.CustomerId ?? "";
        var priceId = FirstPriceId(sub);

        if (existing is null)
        {
            var created = new Domain.Entities.UserSubscription
            {
                UserId = userId,
                StripeCustomerId = customerId,
                StripeSubscriptionId = sub.Id,
                StripePriceId = priceId,
                Status = sub.Status,
                TrialEndsAt = sub.TrialEnd,
            };
            ApplyUserPlan(created, priceId);
            db.UserSubscriptions.Add(created);
        }
        else
        {
            if (!string.IsNullOrEmpty(customerId)) existing.StripeCustomerId = customerId;
            existing.StripeSubscriptionId = sub.Id;
            existing.StripePriceId = priceId;
            existing.Status = sub.Status;
            existing.TrialEndsAt = sub.TrialEnd;
            ApplyUserPlan(existing, priceId);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Mapeia o price_id → plano individual e grava PlanCode/DefaultFeeBps.</summary>
    private void ApplyUserPlan(Domain.Entities.UserSubscription target, string? priceId)
    {
        var (planCode, defaultFeeBps) = MapPlan(priceId);
        if (planCode is not null)
        {
            target.PlanCode = planCode;
            target.DefaultFeeBps = defaultFeeBps;
        }
    }

    private static string? FirstPriceId(Subscription sub) =>
        sub.Items?.Data is { Count: > 0 } items ? items[0].Price?.Id : null;

    /// <summary>
    /// Mapeia o price_id do Stripe para o plano do MarcaAí e grava PlanCode/Quantity/DefaultFeeBps
    /// (fee de split herdada pelo plano, §4.3). Assentos = quantidade do item da assinatura.
    /// Price ids configuráveis em Stripe:Prices:{Solo|Clinica|Pro} — nunca hard-coded.
    /// </summary>
    private void ApplyPlan(Domain.Entities.Subscription target, string? priceId, Subscription sub)
    {
        var (planCode, defaultFeeBps) = MapPlan(priceId);
        if (planCode is not null)
        {
            target.PlanCode = planCode;
            target.DefaultFeeBps = defaultFeeBps;
        }
        target.Quantity = QuantityOf(sub);
    }

    /// <summary>
    /// price_id → (PlanCode, DefaultFeeBps) usando o catálogo canônico (`PlanCatalog`, Q1/Q6):
    /// Solo 10% · Solo Pro 5% · Clínica 2,49% · Clínica Pro 1,99%. Price ids configuráveis em
    /// `Stripe:Prices:{Solo|SoloPro|Clinica|ClinicaPro}` — nunca hard-coded.
    /// </summary>
    private (string? PlanCode, int? DefaultFeeBps) MapPlan(string? priceId)
    {
        if (string.IsNullOrWhiteSpace(priceId)) return (null, null);
        if (priceId == config["Stripe:Prices:Solo"]) return (PlanCatalog.Solo, PlanCatalog.SoloFeeBps);
        if (priceId == config["Stripe:Prices:SoloPro"]) return (PlanCatalog.SoloPro, PlanCatalog.SoloProFeeBps);
        if (priceId == config["Stripe:Prices:Clinica"]) return (PlanCatalog.Clinica, PlanCatalog.ClinicaFeeBps);
        if (priceId == config["Stripe:Prices:ClinicaPro"]) return (PlanCatalog.ClinicaPro, PlanCatalog.ClinicaProFeeBps);
        return (null, null);
    }

    private static int QuantityOf(Subscription sub) =>
        sub.Items?.Data is { Count: > 0 } items ? (int)items[0].Quantity : 1;
}
