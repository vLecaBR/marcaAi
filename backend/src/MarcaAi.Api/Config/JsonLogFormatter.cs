using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MarcaAi.Infrastructure.Observability;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Console;

namespace MarcaAi.Api.Config;

/// <summary>
/// Log em JSON (uma linha por evento) com <c>traceId</c> do Activity corrente — o mesmo que vai no ProblemDetails.
/// Decisões de LGPD: não imprime escopos (o escopo do ASP.NET leva <c>RequestPath</c>, que contém o uid da consulta) e,
/// para exceções, escreve só tipo, mensagem saneada (<see cref="SafeException"/>) e stack — nunca <c>ToString()</c> nem a
/// <c>Message</c> crua, que em erros do Postgres inclui o <c>DETAIL</c> com valores de colunas (e-mail, por exemplo).
/// </summary>
public sealed class JsonLogFormatter() : ConsoleFormatter(Name)
{
    public const string Name = "marcaai-json";

    public override void Write<TState>(in LogEntry<TState> entry, IExternalScopeProvider? scopeProvider, TextWriter textWriter)
    {
        var message = entry.Formatter?.Invoke(entry.State, entry.Exception);
        if (message is null && entry.Exception is null) return;

        using var buffer = new MemoryStream();
        using (var w = new Utf8JsonWriter(buffer))
        {
            w.WriteStartObject();
            w.WriteString("ts", DateTime.UtcNow.ToString("O"));
            w.WriteString("level", entry.LogLevel.ToString());
            w.WriteString("category", entry.Category);
            if (entry.EventId.Id != 0) w.WriteNumber("eventId", entry.EventId.Id);
            w.WriteString("message", message);
            if (Activity.Current is { } a) w.WriteString("traceId", a.TraceId.ToString());
            if (entry.Exception is { } ex)
            {
                w.WriteStartObject("exception");
                w.WriteString("type", ex.GetType().FullName);
                w.WriteString("message", SafeException.Message(ex));
                w.WriteString("stack", ex.StackTrace);
                if (ex.InnerException is { } inner)
                {
                    w.WriteString("innerType", inner.GetType().FullName);
                    w.WriteString("innerMessage", SafeException.Message(inner));
                }
                w.WriteEndObject();
            }
            w.WriteEndObject();
        }
        textWriter.WriteLine(Encoding.UTF8.GetString(buffer.ToArray()));
    }
}
