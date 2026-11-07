using System.Text;

namespace MarcaAi.Api.Config;

/// <summary>
/// Falha o boot (fail-fast) fora de Development quando falta configuração essencial.
/// Evita, por exemplo, cair no <c>LoggingMagicLinkSender</c> (que imprime o link de login no log)
/// ou rodar com a chave JWT de desenvolvimento. Integrações opcionais só geram aviso.
/// </summary>
public static class ProductionConfigValidator
{
    private const int MinJwtKeyBytes = 32;

    public static IReadOnlyList<string> Validate(IConfiguration c)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(c.GetConnectionString("Default")))
            errors.Add("ConnectionStrings:Default é obrigatória.");

        var key = c["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(key) || Encoding.UTF8.GetByteCount(key) < MinJwtKeyBytes)
            errors.Add($"Jwt:SigningKey é obrigatória e deve ter ao menos {MinJwtKeyBytes} bytes.");
        else if (key.Contains("dev", StringComparison.OrdinalIgnoreCase) ||
                 key.Contains("changeme", StringComparison.OrdinalIgnoreCase) ||
                 key.Contains("secret", StringComparison.OrdinalIgnoreCase))
            errors.Add("Jwt:SigningKey parece um valor de desenvolvimento; gere uma chave aleatória (ex.: openssl rand -base64 64).");

        RequireHttps(c, "App:PublicUrl", errors);
        RequireHttps(c, "Cors:FrontendOrigin", errors);

        if (string.IsNullOrWhiteSpace(c["Resend:ApiKey"]))
            errors.Add("Resend:ApiKey é obrigatória (sem ela o link de login iria para o log).");

        return errors;
    }

    /// <summary>Avisos para integrações opcionais não configuradas.</summary>
    public static IEnumerable<string> Warnings(IConfiguration c)
    {
        if (string.IsNullOrWhiteSpace(c["Stripe:SecretKey"])) yield return "Stripe não configurado (billing e cartão desativados).";
        if (string.IsNullOrWhiteSpace(c["MercadoPago:AccessToken"])) yield return "Mercado Pago não configurado (PIX desativado).";
        if (string.IsNullOrWhiteSpace(c["Google:ClientId"]) || string.IsNullOrWhiteSpace(c["Google:ClientSecret"]))
            yield return "Google OAuth não configurado (login Google e Agenda desativados).";
        if (string.IsNullOrWhiteSpace(c["WhatsApp:ApiUrl"]) || string.IsNullOrWhiteSpace(c["WhatsApp:ApiKey"]))
            yield return "WhatsApp não configurado (lembretes só por e-mail).";
        if (string.IsNullOrWhiteSpace(c["Admin:HangfireUserIds"]))
            yield return "Admin:HangfireUserIds vazio: o dashboard do Hangfire fica inacessível.";
    }

    private static void RequireHttps(IConfiguration c, string key, List<string> errors)
    {
        var v = c[key];
        if (string.IsNullOrWhiteSpace(v) || !Uri.TryCreate(v, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            errors.Add($"{key} é obrigatória e deve ser uma URL https.");
    }
}
