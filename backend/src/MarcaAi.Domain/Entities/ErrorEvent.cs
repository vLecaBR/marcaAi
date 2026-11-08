namespace MarcaAi.Domain.Entities;

/// <summary>
/// Erro inesperado capturado na API ("api") ou na interface ("web"), para o painel do dono. NÃO guarda dado pessoal:
/// sem usuário, sem corpo de requisição, sem querystring, e-mails mascarados na mensagem. Retenção curta (30 dias,
/// <c>RetentionJob</c>). Tabela "error_events".
/// </summary>
public class ErrorEvent
{
    public string Id { get; set; } = default!;
    public string Source { get; set; } = "api";
    public string Message { get; set; } = default!;
    public string? Detail { get; set; }
    public string? Path { get; set; }
    public int? Status { get; set; }
    public DateTime CreatedAt { get; set; }
}
