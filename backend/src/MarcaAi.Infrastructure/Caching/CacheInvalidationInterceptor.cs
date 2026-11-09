using System.Data.Common;
using System.Runtime.CompilerServices;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace MarcaAi.Infrastructure.Caching;

/// <summary>
/// Estado compartilhado entre os dois interceptores: o que cada DbContext alterou e ainda precisa invalidar.
/// Regras: consulta/agenda/exceção/tipo de consulta/usuário → escopo do profissional; usuário/tipo de consulta/pergunta →
/// também os perfis públicos; disponibilidade, clínica e membros (sem dono direto) → tudo.
/// A invalidação acontece DEPOIS do commit — se fosse antes, um leitor poderia re-guardar o dado antigo (o commit ainda não
/// está visível) sob a versão nova. Limite conhecido: <c>ExecuteUpdate/ExecuteDelete</c> não passam por aqui (hoje só o outbox e
/// a retenção os usam, e nenhum afeta estas telas).
/// </summary>
public sealed class CacheInvalidationTracker(IReadCache cache)
{
    private sealed class Pending { public readonly HashSet<string> Scopes = []; public bool All; }
    private readonly ConditionalWeakTable<DbContext, Pending> _pending = new();

    public void Collect(DbContext? ctx)
    {
        if (ctx is null) return;
        var p = _pending.GetOrCreateValue(ctx);
        foreach (var e in ctx.ChangeTracker.Entries().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))
        {
            switch (e.Entity)
            {
                case Booking b: p.Scopes.Add(b.UserId); break;
                case Schedule s: p.Scopes.Add(s.UserId); break;
                case ScheduleException x: p.Scopes.Add(x.UserId); break;
                case EventType et: p.Scopes.Add(et.UserId); p.Scopes.Add(IReadCache.ProfilesScope); break;
                case User u: p.Scopes.Add(u.Id); p.Scopes.Add(IReadCache.ProfilesScope); break;
                case EventTypeQuestion: p.Scopes.Add(IReadCache.ProfilesScope); break;
                case ScheduleAvailability or Team or TeamMember: p.All = true; break;
            }
        }
    }

    /// <summary>Gravação concluída: sem transação explícita aberta, o dado já está confirmado — invalida já.</summary>
    public void Saved(DbContext? ctx)
    {
        if (ctx is not null && ctx.Database.CurrentTransaction is null) Flush(ctx);
    }

    public void Committed(DbContext? ctx) { if (ctx is not null) Flush(ctx); }

    public void Discard(DbContext? ctx) { if (ctx is not null) _pending.Remove(ctx); }

    private void Flush(DbContext ctx)
    {
        if (!_pending.TryGetValue(ctx, out var p)) return;
        _pending.Remove(ctx);
        if (p.All) cache.InvalidateAll();
        foreach (var s in p.Scopes) cache.Invalidate(s);
    }
}

public sealed class CacheInvalidationInterceptor(CacheInvalidationTracker tracker) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    { tracker.Collect(eventData.Context); return result; }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    { tracker.Collect(eventData.Context); return ValueTask.FromResult(result); }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    { tracker.Saved(eventData.Context); return result; }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    { tracker.Saved(eventData.Context); return ValueTask.FromResult(result); }

    public override void SaveChangesFailed(DbContextErrorEventData eventData) => tracker.Discard(eventData.Context);

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    { tracker.Discard(eventData.Context); return Task.CompletedTask; }
}

/// <summary>Transações explícitas (ex.: criação de consulta com trava): invalida no commit, descarta no rollback.</summary>
public sealed class CacheInvalidationTransactionInterceptor(CacheInvalidationTracker tracker) : DbTransactionInterceptor
{
    public override void TransactionCommitted(DbTransaction transaction, TransactionEndEventData eventData)
    { tracker.Committed(eventData.Context); }

    public override Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    { tracker.Committed(eventData.Context); return Task.CompletedTask; }

    public override void TransactionRolledBack(DbTransaction transaction, TransactionEndEventData eventData)
    { tracker.Discard(eventData.Context); }

    public override Task TransactionRolledBackAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    { tracker.Discard(eventData.Context); return Task.CompletedTask; }
}
