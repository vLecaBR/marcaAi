using System.Collections.Concurrent;
using MarcaAi.Application.Common.Interfaces;
using Microsoft.Extensions.Caching.Memory;

namespace MarcaAi.Infrastructure.Caching;

/// <summary>
/// <see cref="IReadCache"/> sobre <see cref="MemoryCache"/> com limite de entradas (uma varredura de combinações de
/// fuso/mês não consegue estourar a memória). A chave leva a época global e a versão do escopo; <c>Invalidate</c> só
/// incrementa a versão — as entradas antigas ficam órfãs e saem pelo TTL ou pelo limite.
/// Vale para UMA instância da API (o deploy atual). Com várias réplicas, trocar por cache distribuído.
/// </summary>
public sealed class ReadCache : IReadCache, IDisposable
{
    public const int MaxEntries = 5000;

    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = MaxEntries });
    private readonly ConcurrentDictionary<string, long> _versions = new();
    private readonly ConcurrentDictionary<string, long[]> _stats = new(); // [hits, misses]
    private long _epoch;

    public async Task<T> GetOrCreateAsync<T>(string area, string scope, string key, TimeSpan ttl, Func<Task<T>> factory, Func<T, bool>? shouldCache = null)
    {
        var version = _versions.GetValueOrDefault(scope);
        var fullKey = $"{area}|{Interlocked.Read(ref _epoch)}|{scope}:{version}|{key}";
        var counters = _stats.GetOrAdd(area, _ => new long[2]);

        if (_cache.TryGetValue(fullKey, out var hit) && hit is T value)
        {
            Interlocked.Increment(ref counters[0]);
            return value;
        }

        Interlocked.Increment(ref counters[1]);
        var created = await factory();
        if (shouldCache is null || shouldCache(created))
            _cache.Set(fullKey, created, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl, Size = 1 });
        return created;
    }

    public void Invalidate(string scope) => _versions.AddOrUpdate(scope, 1, (_, v) => v + 1);

    public void InvalidateAll() => Interlocked.Increment(ref _epoch);

    public IReadOnlyDictionary<string, (long Hits, long Misses)> Stats() =>
        _stats.ToDictionary(kv => kv.Key, kv => (Interlocked.Read(ref kv.Value[0]), Interlocked.Read(ref kv.Value[1])));

    public void Dispose() => _cache.Dispose();
}
