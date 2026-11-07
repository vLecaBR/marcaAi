namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Resultado do callback OAuth do Mercado Pago.</summary>
public sealed record MercadoPagoConnectResult(bool Success, string? ErrorCode = null);

/// <summary>
/// Conclusão do OAuth do vendedor no Mercado Pago (marketplace): troca o <c>code</c> por tokens,
/// guarda-os protegidos (Data Protection) na <c>PayoutAccount</c> e libera a conta para cobranças.
/// </summary>
public interface IMercadoPagoConnectService
{
    /// <summary>Conclui a autorização. <paramref name="state"/> é o valor assinado emitido no início do onboarding.</summary>
    Task<MercadoPagoConnectResult> CompleteAuthorizationAsync(string code, string state, CancellationToken ct = default);

    /// <summary>
    /// Devolve o access token do vendedor (renova se expirado) a partir do id da conta no MP (<c>user_id</c>,
    /// = <c>PayoutAccount.ExternalAccountId</c>); null se indisponível ou desconectado.
    /// </summary>
    Task<string?> GetSellerAccessTokenAsync(string externalAccountId, CancellationToken ct = default);

    /// <summary>Revoga/limpa os tokens do vendedor (disconnect).</summary>
    Task RevokeAsync(string payoutAccountId, CancellationToken ct = default);
}
