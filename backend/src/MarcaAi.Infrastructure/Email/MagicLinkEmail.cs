namespace MarcaAi.Infrastructure.Email;

/// <summary>Conteúdo do e-mail do link de acesso (compartilhado por Resend e SMTP).</summary>
public static class MagicLinkEmail
{
    public const string Subject = "Seu link de acesso ao MarcaAí";

    public static string Html(string url) => $"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
          <h2 style="margin:0 0 8px">Acesse sua agenda no MarcaAí</h2>
          <p style="color:#475569">Clique no botão abaixo para entrar. O link vale por <b>15 minutos</b> e só pode ser usado uma vez.</p>
          <p style="margin:24px 0">
            <a href="{url}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Entrar</a>
          </p>
          <p style="color:#94a3b8;font-size:12px">Se você não pediu este acesso, ignore este e-mail: nada será alterado na sua conta.</p>
        </div>
        """;
}
