import { NextResponse, type NextRequest } from "next/server"

/**
 * Middleware (Next 16 `proxy.ts`). NextAuth foi descartado (ADR-0001).
 *
 * Gating **grosseiro** por presença do cookie de sessão (`marcaai_at`) — barato e roda no Edge.
 * A verificação fina (onboarding, papéis de equipe) é feita server-side pelos guardas
 * (`lib/auth/guards.ts`) via `getMe()`, porque só ali dá para consultar a API e reescrever
 * cookies. Aqui não chamamos a API .NET para não pagar latência por requisição.
 *
 * Mantém o rate limit em memória da rota pública de agendamento.
 */

const ACCESS_COOKIE = "marcaai_at"
const PUBLIC_ROUTES = new Set(["/", "/login"])

export const config = {
  matcher: ["/((?!api/auth|api/bff|_next/static|_next/image|favicon.ico).*)"],
}

// Rate limit em memória para a rota de agendamento (best-effort; produção usa store distribuído).
const rateLimit = new Map<string, { count: number; lastReset: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 10

function isRateLimited(req: NextRequest): boolean {
  // IP real: atrás do Cloudflare vem em CF-Connecting-IP; senão o primeiro item de X-Forwarded-For.
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown-ip"
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const record = rateLimit.get(ip)
  if (!record || record.lastReset < windowStart) {
    rateLimit.set(ip, { count: 1, lastReset: now })
    return false
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) return true
  record.count += 1
  rateLimit.set(ip, record)
  return false
}

export default function proxy(req: NextRequest) {
  const { nextUrl } = req

  // Só a CRIAÇÃO do agendamento (POST /api/book). Antes valia para todo /api/book/* e estrangulava o checkout do paciente
  // (polling do pagamento, /pay, /reschedule, /cancel): a API tem os limites próprios de cada rota.
  if (req.method === "POST" && nextUrl.pathname === "/api/book") {
    if (isRateLimited(req)) {
      return new NextResponse(
        JSON.stringify({ error: "Muitas requisições. Tente novamente mais tarde." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      )
    }
  }

  const hasSession = req.cookies.has(ACCESS_COOKIE)
  const isProtected =
    nextUrl.pathname.startsWith("/dashboard") ||
    nextUrl.pathname.startsWith("/settings") ||
    nextUrl.pathname.startsWith("/onboarding") ||
    nextUrl.pathname.startsWith("/admin")
  const isPublic = PUBLIC_ROUTES.has(nextUrl.pathname)

  // Sem cookie tentando acessar área logada → login.
  if (!hasSession && isProtected) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  // Com cookie na página de login/landing → dashboard (o refinamento de onboarding
  // acontece no layout via guarda de rota).
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
}
