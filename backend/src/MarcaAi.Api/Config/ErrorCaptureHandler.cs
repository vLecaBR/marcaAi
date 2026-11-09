using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.Diagnostics;

namespace MarcaAi.Api.Config;

/// <summary>
/// Registra no painel do dono as exceções NÃO tratadas da API (500). Devolve <c>false</c> para o pipeline seguir e responder o
/// ProblemDetails normal. Guarda só tipo, mensagem e primeiras linhas do stack (sem dado pessoal).
/// </summary>
public sealed class ErrorCaptureHandler(IErrorRecorder recorder, ILogger<ErrorCaptureHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        // Rota (template), não o caminho real: o caminho carrega o uid da consulta (credencial de acesso do paciente).
        var route = (ctx.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "(sem rota)";
        logger.LogError(ex, "[Unhandled] {Method} {Route}", ctx.Request.Method, route);
        var stack = string.Join('\n', (ex.StackTrace ?? "").Split('\n').Take(6).Select(l => l.Trim()));
        await recorder.RecordAsync("api", $"{ex.GetType().Name}: {MarcaAi.Infrastructure.Observability.SafeException.Message(ex)}", stack, $"{ctx.Request.Method} {route}", 500, ct);
        return false;
    }
}
