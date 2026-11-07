using MarcaAi.Domain.Enums;

namespace MarcaAi.Domain.Entities;

/// <summary>
/// Sub-conta conectada de recebimento (Mercado Pago Split ou Stripe Connect).
/// Isola as credenciais de repasse do profissional (User) ou da clínica (Team).
/// Tabela "payout_accounts". Ver financial-split-spec.md §5.2.
/// </summary>
/// <remarks>
/// Segredos sensíveis (refresh/access token do MP, secrets do Stripe) NÃO são persistidos aqui:
/// devem viver em secret manager, referenciados externamente. Esta entidade guarda apenas
/// identificadores e estado de KYC/onboarding.
/// </remarks>
public class PayoutAccount
{
    public string Id { get; set; } = default!;

    /// <summary>Se a conta pertence a um profissional (USER) ou a uma clínica (TEAM).</summary>
    public PayoutOwnerType OwnerType { get; set; }

    /// <summary>UserId ou TeamId conforme <see cref="OwnerType"/>.</summary>
    public string OwnerId { get; set; } = default!;

    public PaymentProvider Provider { get; set; }

    /// <summary>Identificador da conta no provedor (MP user_id / Stripe acct_...).</summary>
    public string ExternalAccountId { get; set; } = default!;

    public PayoutAccountStatus Status { get; set; } = PayoutAccountStatus.PENDING;

    /// <summary>Provedor autoriza cobranças nesta conta (KYC ok).</summary>
    public bool ChargesEnabled { get; set; }

    /// <summary>Provedor autoriza repasses/saques para esta conta.</summary>
    public bool PayoutsEnabled { get; set; }

    /// <summary>Link para o dono concluir o onboarding/KYC no provedor.</summary>
    public string? OnboardingUrl { get; set; }

    // Override da taxa da plataforma. Null => usa o padrão do plano/config.
    /// <summary>Override do percentual da taxa MarcaAí, em basis points (250 = 2,5%).</summary>
    public int? FeePercentBps { get; set; }

    /// <summary>Override do componente fixo da taxa MarcaAí, em centavos.</summary>
    public int? FeeFixedCents { get; set; }

    /// <summary>
    /// Se true, o MarcaAí absorve o custo do gateway (deduzido da própria fee);
    /// se false (padrão v1), o dono da conta absorve o custo do gateway.
    /// </summary>
    public bool AbsorbGatewayCost { get; set; }

    /// <summary>
    /// Mercado Pago: access token do vendedor (OAuth), **protegido** com ASP.NET Data Protection
    /// (nunca em texto puro). Null para Stripe.
    /// </summary>
    public string? EncryptedAccessToken { get; set; }

    /// <summary>Mercado Pago: refresh token do vendedor, protegido com Data Protection.</summary>
    public string? EncryptedRefreshToken { get; set; }

    /// <summary>Mercado Pago: expiração do access token (UTC).</summary>
    public DateTime? TokenExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
