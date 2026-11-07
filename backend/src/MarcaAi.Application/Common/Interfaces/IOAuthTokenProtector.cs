namespace MarcaAi.Application.Common.Interfaces;

/// <summary>
/// Cifra tokens OAuth (Google) em repouso (LGPD Art. 46; gap G09). Valores cifrados levam o prefixo <c>enc:</c>;
/// valores legados em texto puro (sem prefixo) continuam legíveis e são cifrados pelo job de retenção.
/// </summary>
public interface IOAuthTokenProtector
{
    string? Protect(string? plain);
    string? Unprotect(string? stored);
    bool IsProtected(string? stored);
}
