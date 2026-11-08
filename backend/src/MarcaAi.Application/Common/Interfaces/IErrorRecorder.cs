namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Registra erros inesperados (sem dado pessoal) para acompanhamento no painel do dono. Nunca lança.</summary>
public interface IErrorRecorder
{
    Task RecordAsync(string source, string message, string? detail, string? path, int? status, CancellationToken cancellationToken = default);
}
