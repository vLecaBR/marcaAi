namespace MarcaAi.Domain.Entities;

/// <summary>
/// Resposta guardada de uma requisição com cabeçalho <c>Idempotency-Key</c> (POST /bookings e POST /bookings/{uid}/pay): repetir a
/// mesma chave com o mesmo corpo devolve a MESMA resposta sem executar de novo (duplo clique, retry de rede). Chave = (rota+uid, chave
/// do cliente). Guarda só a resposta da API (uid da consulta, status, mensagem de erro; no pagamento, o clientSecret de curta duração) —
/// não guarda o corpo da requisição (só o hash). Retenção: <c>ExpiresAt</c> (24 h; 30 min no pagamento). Tabela "idempotency_keys".
/// </summary>
public class IdempotencyKey
{
    public string Scope { get; set; } = default!;
    public string Key { get; set; } = default!;
    /// <summary>SHA-256 (base64) do corpo da requisição: a mesma chave com outro corpo é um erro do cliente.</summary>
    public string RequestHash { get; set; } = default!;
    /// <summary>"IN_PROGRESS" enquanto executa; "DONE" quando a resposta foi guardada.</summary>
    public string State { get; set; } = "IN_PROGRESS";
    public int? StatusCode { get; set; }
    public string? ContentType { get; set; }
    public string? Body { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}
