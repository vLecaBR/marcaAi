namespace MarcaAi.Api.Auth;

/// <summary>
/// Defesa CSRF por verificação de origem (achado #17 / G21), complementar ao SameSite do cookie de sessão.
/// Em requisições que alteram estado (POST/PUT/PATCH/DELETE) e trazem o cookie de sessão:
/// o cabeçalho <c>Origin</c>, quando presente, precisa ser o do front; sem <c>Origin</c>, recusa se o navegador declarar
/// <c>Sec-Fetch-Site: cross-site</c>. Chamadas servidor→servidor do BFF (sem Origin/Sec-Fetch) e webhooks (sem cookie) passam.
/// Um site malicioso nunca consegue forjar o Origin de um POST feito pelo navegador da vítima.
/// </summary>
public sealed class CsrfOriginGuard(RequestDelegate next, IConfiguration config, ILogger<CsrfOriginGuard> logger)
{
    private static readonly HashSet<string> Unsafe = new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "PATCH", "DELETE" };

    public async Task InvokeAsync(HttpContext ctx)
    {
        var cookieName = config["Jwt:CookieName"] ?? "marcaai_at";
        if (Unsafe.Contains(ctx.Request.Method) && ctx.Request.Cookies.ContainsKey(cookieName))
        {
            var allowed = (config["Cors:FrontendOrigin"] ?? "").TrimEnd('/');
            var origin = ctx.Request.Headers.Origin.ToString().TrimEnd('/');
            var site = ctx.Request.Headers["Sec-Fetch-Site"].ToString();

            var blocked = origin.Length > 0
                ? !string.Equals(origin, allowed, StringComparison.OrdinalIgnoreCase)
                : string.Equals(site, "cross-site", StringComparison.OrdinalIgnoreCase);

            if (blocked)
            {
                logger.LogWarning("[CSRF] {Method} {Path} bloqueado: Origin='{Origin}' Sec-Fetch-Site='{Site}'",
                    ctx.Request.Method, ctx.Request.Path, origin, site);
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ctx.Response.WriteAsJsonAsync(new { title = "Origem não permitida.", status = 403 });
                return;
            }
        }
        await next(ctx);
    }
}
