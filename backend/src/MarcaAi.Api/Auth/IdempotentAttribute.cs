using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MarcaAi.Api.Auth;

/// <summary>
/// Torna uma ação POST idempotente quando o cliente manda <c>Idempotency-Key</c> (8–64 caracteres A-Z a-z 0-9 _ -). Sem o cabeçalho,
/// nada muda. Com ele: a 1ª execução grava a resposta (2xx/4xx, exceto 429); a repetição com o mesmo corpo devolve a resposta guardada
/// (cabeçalho <c>Idempotent-Replayed: true</c>) sem executar; repetição ENQUANTO executa → 409 + Retry-After; mesmo cabeçalho com
/// outro corpo → 422. Falhas 5xx e exceções não são guardadas (o cliente pode tentar de novo). Uma execução abandonada (queda no meio)
/// é retomada após 2 minutos. Ver <see cref="MarcaAi.Domain.Entities.IdempotencyKey"/>.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class IdempotentAttribute(int ttlMinutes = 1440) : Attribute, IFilterFactory
{
    public bool IsReusable => false;
    public IFilterMetadata CreateInstance(IServiceProvider sp) => ActivatorUtilities.CreateInstance<IdempotencyFilter>(sp, TimeSpan.FromMinutes(ttlMinutes));
}

public sealed partial class IdempotencyFilter(TimeSpan ttl, IServiceScopeFactory scopes, IOptions<Microsoft.AspNetCore.Mvc.JsonOptions> json) : IAsyncResourceFilter
{
    public const string HeaderName = "Idempotency-Key";
    private static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(2);

    [GeneratedRegex("^[A-Za-z0-9_-]{8,64}$")]
    private static partial Regex ValidKey();

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        var http = context.HttpContext;
        if (!http.Request.Headers.TryGetValue(HeaderName, out var raw) || string.IsNullOrWhiteSpace(raw.ToString()))
        { await next(); return; }

        var key = raw.ToString().Trim();
        if (!ValidKey().IsMatch(key))
        { context.Result = Problem(400, $"{HeaderName} inválido (8 a 64 caracteres: letras, números, _ e -)."); return; }

        // Corpo -> hash (e rebobina para o model binding ler normalmente).
        http.Request.EnableBuffering();
        using var ms = new MemoryStream();
        await http.Request.Body.CopyToAsync(ms, http.RequestAborted);
        http.Request.Body.Position = 0;
        var hash = Convert.ToBase64String(SHA256.HashData(ms.ToArray()));

        var template = context.ActionDescriptor.AttributeRouteInfo?.Template ?? http.Request.Path.Value ?? "";
        var uid = context.RouteData.Values.TryGetValue("uid", out var u) ? u?.ToString() : null;
        var scope = $"{http.Request.Method} {template}|{uid}";
        var now = DateTime.UtcNow;

        for (var attempt = 0; attempt < 2; attempt++)
        {
            // 1) Tenta reivindicar a chave (atômico). 1 linha = somos os donos.
            int claimed;
            using (var s = scopes.CreateScope())
            {
                var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO idempotency_keys ("scope","key","requestHash","state","createdAt","expiresAt")
                    VALUES ({scope},{key},{hash},'IN_PROGRESS',{now},{now + ttl}) ON CONFLICT ("scope","key") DO NOTHING
                    """, http.RequestAborted);
            }
            if (claimed == 1) { await ExecuteAndStoreAsync(context, next, scope, key); return; }

            // 2) Já existe: lê o estado.
            Domain.Entities.IdempotencyKey? row;
            using (var s = scopes.CreateScope())
                row = await s.ServiceProvider.GetRequiredService<ApplicationDbContext>().IdempotencyKeys.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Scope == scope && x.Key == key, http.RequestAborted);
            if (row is null) continue; // sumiu entre as duas consultas (limpeza/falha): tenta reivindicar de novo

            if (row.ExpiresAt <= now)
            {
                await DeleteAsync(scope, key, row.RequestHash, http.RequestAborted);
                continue;
            }
            if (row.RequestHash != hash)
            { context.Result = Problem(422, $"Este {HeaderName} já foi usado com outro conteúdo. Gere uma nova chave para uma nova solicitação."); return; }

            if (row.State == "DONE")
            {
                http.Response.Headers["Idempotent-Replayed"] = "true";
                context.Result = new ContentResult { StatusCode = row.StatusCode, ContentType = row.ContentType, Content = row.Body };
                return;
            }

            // IN_PROGRESS: outra requisição igual está executando — ou morreu no meio (retoma depois de StaleAfter).
            if (row.CreatedAt < now - StaleAfter)
            {
                int took;
                using (var s = scopes.CreateScope())
                    took = await s.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.ExecuteSqlInterpolatedAsync($"""
                        UPDATE idempotency_keys SET "createdAt" = {now} WHERE "scope" = {scope} AND "key" = {key} AND "state" = 'IN_PROGRESS' AND "createdAt" = {row.CreatedAt}
                        """, http.RequestAborted);
                if (took == 1) { await ExecuteAndStoreAsync(context, next, scope, key); return; }
            }
            http.Response.Headers.RetryAfter = "1";
            context.Result = Problem(409, "Esta solicitação já está sendo processada. Aguarde um instante.");
            return;
        }
        context.Result = Problem(409, "Não foi possível confirmar a solicitação agora. Tente novamente.");
    }

    private async Task ExecuteAndStoreAsync(ResourceExecutingContext context, ResourceExecutionDelegate next, string scope, string key)
    {
        ResourceExecutedContext executed;
        try { executed = await next(); }
        catch { await DeleteAsync(scope, key, null, CancellationToken.None); throw; }

        // Exceção não tratada ou 5xx/429: libera a chave para o cliente tentar de novo.
        if (executed.Exception is not null && !executed.ExceptionHandled) { await DeleteAsync(scope, key, null, CancellationToken.None); return; }

        int status; string contentType; string body;
        switch (executed.Result)
        {
            case ObjectResult o:
                status = o.StatusCode ?? 200;
                contentType = o.Value is Microsoft.AspNetCore.Mvc.ProblemDetails ? "application/problem+json" : "application/json";
                body = System.Text.Json.JsonSerializer.Serialize(o.Value, o.Value?.GetType() ?? typeof(object), json.Value.JsonSerializerOptions);
                break;
            case StatusCodeResult sc: status = sc.StatusCode; contentType = "application/json"; body = ""; break;
            default: await DeleteAsync(scope, key, null, CancellationToken.None); return; // resultado desconhecido: não guarda
        }
        if (status >= 500 || status == 429) { await DeleteAsync(scope, key, null, CancellationToken.None); return; }

        using var s = scopes.CreateScope();
        await s.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE idempotency_keys SET "state" = 'DONE', "statusCode" = {status}, "contentType" = {contentType}, "body" = {body}
            WHERE "scope" = {scope} AND "key" = {key}
            """, CancellationToken.None);
    }

    private async Task DeleteAsync(string scope, string key, string? requestHash, CancellationToken ct)
    {
        using var s = scopes.CreateScope();
        await s.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.ExecuteSqlInterpolatedAsync(
            $"""DELETE FROM idempotency_keys WHERE "scope" = {scope} AND "key" = {key}""", ct);
    }

    private static ObjectResult Problem(int status, string detail) =>
        new(new Microsoft.AspNetCore.Mvc.ProblemDetails { Status = status, Title = status == 422 ? "Unprocessable Entity" : status == 409 ? "Conflict" : "Bad Request", Detail = detail })
        { StatusCode = status, ContentTypes = { "application/problem+json" } };
}
