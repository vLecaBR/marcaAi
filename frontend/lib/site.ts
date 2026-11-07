/**
 * Host público exibido nos links de agendamento (ex.: "app.seudominio.com.br"), derivado de NEXT_PUBLIC_APP_URL.
 * Sem a variável, cai em "marcaai.app" (apenas visual, em desenvolvimento).
 */
function hostFrom(url: string | undefined): string {
  if (!url) return "marcaai.app"
  try {
    return new URL(url).host
  } catch {
    return "marcaai.app"
  }
}

export const PUBLIC_HOST = hostFrom(process.env.NEXT_PUBLIC_APP_URL)
