using System.Text.RegularExpressions;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Observability;

public sealed partial class ErrorRecorder(IServiceScopeFactory scopes, ILogger<ErrorRecorder> logger) : IErrorRecorder
{
    [GeneratedRegex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")]
    private static partial Regex Email();

    [GeneratedRegex(@"\b\d{10,}\b")]
    private static partial Regex LongNumber();

    /// <summary>Remove e-mails e números longos (telefone/CPF) e limita o tamanho.</summary>
    internal static string Scrub(string? s, int max)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        s = Email().Replace(s, "[email]");
        s = LongNumber().Replace(s, "[num]");
        return s.Length > max ? s[..max] : s;
    }

    public async Task RecordAsync(string source, string message, string? detail, string? path, int? status, CancellationToken ct = default)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var cleanPath = path is null ? null : Scrub(path.Split('?', '#')[0], 200);
            db.ErrorEvents.Add(new ErrorEvent
            {
                Source = source is "web" ? "web" : "api",
                Message = Scrub(message, 300),
                Detail = detail is null ? null : Scrub(detail, 1500),
                Path = cleanPath,
                Status = status,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[Errors] Falha ao registrar o erro (ignorada).");
        }
    }
}
