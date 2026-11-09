using Hangfire;

namespace MarcaAi.Api.Config;

/// <summary>
/// Política dos jobs em segundo plano. Falha de job: 5 tentativas com espera crescente e depois fica "Failed" (aparece no /admin);
/// um job nunca roda em paralelo com ele mesmo. Os jobs em si são idempotentes: o lembrete marca <c>ReminderSent</c> na mesma gravação
/// que enfileira o e-mail, a expiração só age sobre reservas ainda PENDING, o outbox reivindica cada mensagem com aluguel e a
/// retenção apenas apaga/anonimiza o que já venceu.
/// </summary>
public static class HangfireResilience
{
    public const int Attempts = 5;
    public static readonly int[] DelaysInSeconds = [30, 120, 600, 1800, 3600];

    private static readonly object Gate = new();

    // Instâncias únicas por processo: o AutomaticRetryAttribute pega um logger no construtor, e em testes (vários hosts no mesmo
    // processo, o primeiro já descartado) criar outro quebraria. Em produção há um host só.
    private static readonly AutomaticRetryAttribute Retry = new()
    {
        Attempts = Attempts,
        DelaysInSeconds = DelaysInSeconds,
        OnAttemptsExceeded = AttemptsExceededAction.Fail,
        LogEvents = true,
    };
    // Se uma rodada anterior ainda estiver rodando, a nova espera até 55 s e então desiste (a próxima rodada tenta de novo).
    private static readonly DisableConcurrentExecutionAttribute NoOverlap = new(timeoutInSeconds: 55);

    /// <summary>Idempotente: troca os filtros padrão do Hangfire pelos nossos, uma vez, mesmo com vários hosts no processo.</summary>
    public static void Apply()
    {
        lock (Gate)
        {
            var filters = GlobalJobFilters.Filters;
            foreach (var f in filters.Where(f => f.Instance is AutomaticRetryAttribute or DisableConcurrentExecutionAttribute
                                                 && !ReferenceEquals(f.Instance, Retry) && !ReferenceEquals(f.Instance, NoOverlap)).ToList())
                filters.Remove(f.Instance);
            if (!filters.Any(f => ReferenceEquals(f.Instance, Retry))) filters.Add(Retry);
            if (!filters.Any(f => ReferenceEquals(f.Instance, NoOverlap))) filters.Add(NoOverlap);
        }
    }
}
