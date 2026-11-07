using MarcaAi.Application.Common.Interfaces;
using Microsoft.AspNetCore.DataProtection;

namespace MarcaAi.Infrastructure.Identity;

public sealed class OAuthTokenProtector(IDataProtectionProvider provider) : IOAuthTokenProtector
{
    private const string Prefix = "enc:";
    private readonly IDataProtector _p = provider.CreateProtector("MarcaAi.OAuth.Tokens.v1");

    public bool IsProtected(string? stored) => stored is not null && stored.StartsWith(Prefix, StringComparison.Ordinal);

    public string? Protect(string? plain) =>
        string.IsNullOrEmpty(plain) ? plain : IsProtected(plain) ? plain : Prefix + _p.Protect(plain);

    public string? Unprotect(string? stored)
    {
        if (string.IsNullOrEmpty(stored) || !IsProtected(stored)) return stored; // legado em texto
        try { return _p.Unprotect(stored[Prefix.Length..]); }
        catch (Exception) { return null; } // chaves do Data Protection mudaram: trata como ausente (usuário reconecta)
    }
}
