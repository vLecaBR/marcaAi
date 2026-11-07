using Hangfire.Dashboard;

namespace MarcaAi.Api.Auth;

/// <summary>
/// Autoriza o dashboard do Hangfire em produção: só usuários autenticados cujo id (claim "sub")
/// esteja em <c>Admin:HangfireUserIds</c> (lista separada por vírgula). Lista vazia = ninguém.
/// </summary>
public sealed class HangfireAdminFilter(IReadOnlySet<string> allowedUserIds) : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var user = context.GetHttpContext().User;
        if (user.Identity?.IsAuthenticated != true) return false;
        var id = user.GetUserId();
        return id is not null && allowedUserIds.Contains(id);
    }
}
