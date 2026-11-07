namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Job diário de retenção/higiene (LGPD Arts. 15–16): anonimiza consultas antigas e limpa dados efêmeros.</summary>
public interface IRetentionJob
{
    Task RunAsync(CancellationToken cancellationToken = default);
}
