using Npgsql;

namespace MarcaAi.Infrastructure.Observability;

/// <summary>
/// Texto de exceção seguro para log e para o painel de erros. A <c>Message</c> de um <see cref="PostgresException"/> já
/// inclui o <c>DETAIL</c> do servidor, com valores de colunas (e-mail, nome…): aqui entra só código, texto-base e restrição.
/// </summary>
public static class SafeException
{
    public static string Message(Exception ex) => ex switch
    {
        PostgresException pg => $"{pg.SqlState}: {pg.MessageText}" + (pg.ConstraintName is { Length: > 0 } c ? $" [{c}]" : ""),
        _ => ex.Message,
    };
}
