using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Payments;

/// <summary>
/// OAuth do vendedor no Mercado Pago (marketplace). Fluxo: <see cref="CreateOnboardingLinkAsync"/> devolve a URL de
/// autorização (com <c>state</c> assinado, de vida curta, ligado ao owner) → o vendedor autoriza → o MP redireciona para
/// o callback da API → <see cref="CompleteAuthorizationAsync"/> troca o code por tokens e os guarda **cifrados**
/// (ASP.NET Data Protection) na <c>PayoutAccount</c>. Tokens nunca vão para logs nem para o front.
/// Config: MercadoPago:ClientId, ClientSecret, RedirectUri (URL pública do callback da API).
/// </summary>
public sealed class MercadoPagoConnectService(
    ApplicationDbContext db, HttpClient http, IConfiguration config,
    IDataProtectionProvider dataProtection, ILogger<MercadoPagoConnectService> logger)
    : IConnectOnboardingService, IMercadoPagoConnectService
{
    private const string AuthorizeUrl = "https://auth.mercadopago.com.br/authorization";
    private const string TokenUrl = "https://api.mercadopago.com/oauth/token";
    private static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan RefreshSkew = TimeSpan.FromMinutes(5);

    public PaymentProvider Provider => PaymentProvider.MERCADO_PAGO;

    private string? ClientId => config["MercadoPago:ClientId"];
    private string? ClientSecret => config["MercadoPago:ClientSecret"];
    private string? RedirectUri => config["MercadoPago:RedirectUri"];
    private bool Configured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret) && !string.IsNullOrWhiteSpace(RedirectUri);

    private IDataProtector TokenProtector => dataProtection.CreateProtector("MarcaAi.MercadoPago.SellerTokens.v1");
    private ITimeLimitedDataProtector StateProtector =>
        dataProtection.CreateProtector("MarcaAi.MercadoPago.OAuthState.v1").ToTimeLimitedDataProtector();

    // ── Início do onboarding ────────────────────────────────────────────────
    public Task<ConnectOnboardingResult> CreateOnboardingLinkAsync(
        string? existingExternalAccountId, string ownerReference, CancellationToken ct = default)
    {
        if (!Configured)
        {
            logger.LogWarning("[MPConnect] ClientId/ClientSecret/RedirectUri ausentes — onboarding indisponível.");
            return Task.FromResult(ConnectOnboardingResult.NotConfigured(
                "Recebimentos por PIX ainda não estão configurados nesta conta. Fale com o suporte.", "mp_not_configured"));
        }

        // ownerReference = "USER:abc" | "TEAM:xyz" — vai assinado dentro do state (anti-adulteração, expira em 15 min).
        var state = StateProtector.Protect(ownerReference, StateLifetime);
        var url = $"{AuthorizeUrl}?client_id={Uri.EscapeDataString(ClientId!)}&response_type=code&platform_id=mp" +
                  $"&state={Uri.EscapeDataString(state)}&redirect_uri={Uri.EscapeDataString(RedirectUri!)}";
        // ExternalAccountId só é conhecido após o callback (user_id do MP).
        return Task.FromResult(ConnectOnboardingResult.Ok(existingExternalAccountId ?? string.Empty, url));
    }

    // ── Callback ────────────────────────────────────────────────────────────
    public async Task<MercadoPagoConnectResult> CompleteAuthorizationAsync(string code, string state, CancellationToken ct = default)
    {
        if (!Configured) return new(false, "mp_not_configured");

        string owner;
        try { owner = StateProtector.Unprotect(state); }
        catch (Exception)
        {
            logger.LogWarning("[MPConnect] state inválido ou expirado no callback.");
            return new(false, "invalid_state");
        }

        var parts = owner.Split(':', 2);
        if (parts.Length != 2 || !Enum.TryParse<PayoutOwnerType>(parts[0], out var ownerType)) return new(false, "invalid_state");
        var ownerId = parts[1];

        var account = await db.PayoutAccounts.FirstOrDefaultAsync(a =>
            a.OwnerType == ownerType && a.OwnerId == ownerId && a.Provider == PaymentProvider.MERCADO_PAGO, ct);
        if (account is null) return new(false, "account_not_found");

        var tokens = await RequestTokensAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = RedirectUri!,
        }, ct);
        if (tokens is null) return new(false, "token_exchange_failed");

        // Já existe outra conta MP ativa com esse user_id (de outro owner)? Evita duas contas dividindo a mesma carteira.
        var duplicate = await db.PayoutAccounts.AnyAsync(a =>
            a.Provider == PaymentProvider.MERCADO_PAGO && a.ExternalAccountId == tokens.UserId && a.Id != account.Id
            && a.Status == PayoutAccountStatus.ACTIVE, ct);
        if (duplicate) return new(false, "account_already_linked");

        Apply(account, tokens);
        account.ExternalAccountId = tokens.UserId;
        // A autorização OAuth indica conta MP utilizável para receber; cobranças reais validam o resto.
        account.Status = PayoutAccountStatus.ACTIVE;
        account.ChargesEnabled = true;
        account.PayoutsEnabled = true;
        account.OnboardingUrl = null;
        await db.SaveChangesAsync(ct);

        logger.LogInformation("[MPConnect] Vendedor conectado: payoutAccount={Id}", account.Id);
        return new(true);
    }

    // ── Token do vendedor (com refresh) ─────────────────────────────────────
    public async Task<string?> GetSellerAccessTokenAsync(string externalAccountId, CancellationToken ct = default)
    {
        var account = await db.PayoutAccounts.FirstOrDefaultAsync(a =>
            a.Provider == PaymentProvider.MERCADO_PAGO && a.ExternalAccountId == externalAccountId, ct);
        if (account?.EncryptedAccessToken is null || account.Status == PayoutAccountStatus.DISABLED) return null;

        if (account.TokenExpiresAt is { } exp && exp - RefreshSkew <= DateTime.UtcNow)
        {
            if (account.EncryptedRefreshToken is null) return null;
            string refresh;
            try { refresh = TokenProtector.Unprotect(account.EncryptedRefreshToken); }
            catch (Exception) { logger.LogError("[MPConnect] Não foi possível ler o refresh token (chaves do Data Protection mudaram?)."); return null; }

            var tokens = await RequestTokensAsync(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refresh,
            }, ct);
            if (tokens is null) return null;
            Apply(account, tokens);
            await db.SaveChangesAsync(ct);
        }

        try { return TokenProtector.Unprotect(account.EncryptedAccessToken); }
        catch (Exception)
        {
            logger.LogError("[MPConnect] Não foi possível ler o access token (chaves do Data Protection mudaram?).");
            return null;
        }
    }

    public async Task RevokeAsync(string payoutAccountId, CancellationToken ct = default)
    {
        var account = await db.PayoutAccounts.FirstOrDefaultAsync(a => a.Id == payoutAccountId, ct);
        if (account is null || account.Provider != PaymentProvider.MERCADO_PAGO) return;
        // O MP não oferece endpoint de revogação do token do vendedor: descartamos os tokens localmente
        // (o vendedor pode remover o acesso do app em "Aplicações conectadas" na conta dele).
        account.EncryptedAccessToken = null;
        account.EncryptedRefreshToken = null;
        account.TokenExpiresAt = null;
        await db.SaveChangesAsync(ct);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    private void Apply(Domain.Entities.PayoutAccount account, SellerTokens t)
    {
        account.EncryptedAccessToken = TokenProtector.Protect(t.AccessToken);
        if (!string.IsNullOrEmpty(t.RefreshToken)) account.EncryptedRefreshToken = TokenProtector.Protect(t.RefreshToken);
        account.TokenExpiresAt = DateTime.UtcNow.AddSeconds(t.ExpiresInSeconds);
    }

    private sealed record SellerTokens(string AccessToken, string? RefreshToken, string UserId, int ExpiresInSeconds);

    private async Task<SellerTokens?> RequestTokensAsync(Dictionary<string, string> extra, CancellationToken ct)
    {
        var body = new Dictionary<string, string>(extra)
        {
            ["client_id"] = ClientId!,
            ["client_secret"] = ClientSecret!,
        };
        try
        {
            using var res = await http.PostAsJsonAsync(TokenUrl, body, ct);
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[MPConnect] Troca de token falhou ({Status})", (int)res.StatusCode);
                return null; // corpo pode conter dados sensíveis: não loga
            }
            using var doc = JsonDocument.Parse(text);
            var r = doc.RootElement;
            var access = r.GetProperty("access_token").GetString();
            if (string.IsNullOrEmpty(access)) return null;
            var userId = r.TryGetProperty("user_id", out var u) ? u.GetRawText().Trim('"') : "";
            if (string.IsNullOrEmpty(userId)) return null;
            return new SellerTokens(
                access,
                r.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null,
                userId,
                r.TryGetProperty("expires_in", out var ex) && ex.TryGetInt32(out var s) ? s : 15_552_000);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[MPConnect] Erro na troca de token");
            return null;
        }
    }
}
