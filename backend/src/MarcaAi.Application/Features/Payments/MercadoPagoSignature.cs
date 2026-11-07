using System.Security.Cryptography;
using System.Text;

namespace MarcaAi.Application.Features.Payments;

/// <summary>
/// Validação do header <c>x-signature</c> dos webhooks do Mercado Pago (v1).
/// Formato do header: <c>ts=&lt;epoch&gt;,v1=&lt;hmac-sha256-hex&gt;</c>.
/// Manifesto assinado: <c>id:&lt;data.id&gt;;request-id:&lt;x-request-id&gt;;ts:&lt;ts&gt;;</c> (HMAC-SHA256 com o secret do webhook).
/// </summary>
public static class MercadoPagoSignature
{
    /// <summary>Tolerância contra replay: webhooks com <c>ts</c> mais antigo que isso são rejeitados.</summary>
    public static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(10);

    public static bool IsValid(
        string secret, string? signatureHeader, string? requestId, string? dataId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(signatureHeader)) return false;

        string? ts = null, v1 = null;
        foreach (var part in signatureHeader.Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            var key = kv[0].Trim();
            if (key == "ts") ts = kv[1].Trim();
            else if (key == "v1") v1 = kv[1].Trim();
        }
        if (string.IsNullOrEmpty(ts) || string.IsNullOrEmpty(v1)) return false;
        if (!long.TryParse(ts, out var tsValue)) return false;

        // O MP envia ts em milissegundos; aceita segundos também.
        var sent = tsValue > 100_000_000_000
            ? DateTimeOffset.FromUnixTimeMilliseconds(tsValue)
            : DateTimeOffset.FromUnixTimeSeconds(tsValue);
        if ((now - sent).Duration() > MaxAge) return false;

        // Se o id é alfanumérico, o MP assina em minúsculas.
        var id = dataId ?? "";
        if (id.All(char.IsAsciiLetterOrDigit)) id = id.ToLowerInvariant();

        var manifest = $"id:{id};request-id:{requestId};ts:{ts};";
        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(manifest))).ToLowerInvariant();

        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(v1.ToLowerInvariant()));
    }
}
