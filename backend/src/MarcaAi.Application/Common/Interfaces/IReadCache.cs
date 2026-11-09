namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Cache de leitura em memória (instância única) para rotas públicas baratas de repetir: perfil público e dias livres do mês.
/// Cada entrada pertence a um "escopo" (um profissional, ou <see cref="ProfilesScope"/>). Invalidar o escopo torna as entradas
/// antigas inalcançáveis na hora (a versão do escopo faz parte da chave); o TTL curto limita o que a invalidação não vê
/// (ex.: mudança na agenda do Google). Só resultados bem-sucedidos são guardados.
/// </summary>
public interface IReadCache
{
    /// <summary>Escopo dos perfis públicos (muda quando usuário, tipo de consulta ou pergunta mudam).</summary>
    const string ProfilesScope = "profiles";

    /// <summary>Devolve o valor guardado ou calcula, guarda (se <paramref name="shouldCache"/> aprovar) e devolve.</summary>
    Task<T> GetOrCreateAsync<T>(string area, string scope, string key, TimeSpan ttl, Func<Task<T>> factory, Func<T, bool>? shouldCache = null);

    /// <summary>Invalida um escopo (ex.: o id do profissional cuja agenda/consultas mudaram).</summary>
    void Invalidate(string scope);

    /// <summary>Invalida tudo (mudança sem dono identificável, como a disponibilidade de uma agenda).</summary>
    void InvalidateAll();

    /// <summary>Acertos e erros por área, desde que o processo subiu.</summary>
    IReadOnlyDictionary<string, (long Hits, long Misses)> Stats();
}
