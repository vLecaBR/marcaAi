import "server-only"

/**
 * Cliente HTTP único para a API .NET (server-side).
 *
 * Regras (spec §3.1, §8 · ADR-0001):
 *  - o cookie de sessão é `HttpOnly` e NUNCA é lido pelo JS do cliente — por isso este módulo é
 *    `server-only` e o cookie é sempre repassado a partir do contexto de servidor;
 *  - mutations injetam o header CSRF (`X-XSRF-TOKEN`) casado com o cookie `marcaai_csrf`;
 *  - falhas viram `ApiError` (ProblemDetails normalizado); nunca se retorna erro "solto".
 *
 * Duas portas de entrada:
 *  - `rawApiFetch`   — núcleo; recebe cookie/CSRF explícitos. Usado pelo BFF (Route Handlers).
 *  - `serverApiFetch`— açúcar para RSC: lê os cookies da requisição via `next/headers`.
 *    NÃO faz refresh automático (durante o render de um RSC os cookies são read-only); o ciclo
 *    `401 → refresh → retry` vive no BFF, que pode reescrever `Set-Cookie` (ver bff.ts).
 */

import { cookies } from "next/headers"
import { API_URL, COOKIE, CSRF_HEADER, MUTATION_METHODS } from "@/lib/api/config"
import { apiErrorFromResponse, ApiError } from "@/lib/api/problem-details"
import type { ApiResult } from "@/lib/api/types"

/** Credenciais de sessão extraídas do contexto de servidor e injetadas na chamada. */
export interface ApiCredentials {
  /** Header `Cookie` completo a repassar para a API (inclui `marcaai_at` e `marcaai_csrf`). */
  cookieHeader?: string
  /** Valor do token CSRF (do cookie `marcaai_csrf`), injetado no header em mutations. */
  csrfToken?: string
}

export interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** Corpo JSON (serializado automaticamente) ou `BodyInit` cru (repassado como está). */
  body?: unknown
  /** Query string a anexar ao path. */
  query?: Record<string, string | number | boolean | null | undefined>
}

function buildUrl(path: string, query?: ApiFetchInit["query"]): string {
  const base = path.startsWith("http")
    ? path
    : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`
  if (!query) return base
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) qs.append(k, String(v))
  }
  const suffix = qs.toString()
  return suffix ? `${base}?${suffix}` : base
}

function isJsonBody(body: unknown): boolean {
  if (body === undefined || body === null) return false
  if (typeof body === "string") return false
  if (body instanceof FormData || body instanceof URLSearchParams) return false
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false
  return true
}

/**
 * Núcleo do cliente. Recebe cookie/CSRF explícitos — agnóstico de onde vieram —, o que o
 * mantém testável e utilizável tanto por RSC quanto pelo BFF.
 *
 * @throws {ApiError} em respostas não-2xx ou falha de rede.
 */
export async function rawApiFetch<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
  creds: ApiCredentials = {},
): Promise<ApiResult<T>> {
  const { body, query, headers, method = "GET", ...rest } = init
  const url = buildUrl(path, query)

  const finalHeaders = new Headers(headers)
  finalHeaders.set("Accept", "application/json")
  if (creds.cookieHeader) finalHeaders.set("Cookie", creds.cookieHeader)

  // IP real do usuário para o rate limit da API (que só enxerga este servidor). A API só confia nesse
  // header quando a chamada vem da rede interna (Proxy:TrustedNetworks).
  const clientIp = await resolveClientIp()
  if (clientIp) finalHeaders.set("CF-Connecting-IP", clientIp)

  // Antiforgery: só em mutations (spec §3.1).
  if (MUTATION_METHODS.has(method.toUpperCase()) && creds.csrfToken) {
    finalHeaders.set(CSRF_HEADER, creds.csrfToken)
  }

  let finalBody: BodyInit | undefined
  if (isJsonBody(body)) {
    finalHeaders.set("Content-Type", "application/json")
    finalBody = JSON.stringify(body)
  } else if (body !== undefined && body !== null) {
    finalBody = body as BodyInit
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      method,
      headers: finalHeaders,
      body: finalBody,
      // Cookie é repassado explicitamente via header; não dependemos do jar do runtime.
      cache: rest.cache ?? "no-store",
    })
  } catch (cause) {
    throw ApiError.network(cause)
  }

  const setCookies = readSetCookies(res)

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  // 204 / corpo vazio → data nula tipada.
  const data = (await parseBody(res)) as T
  return { data, status: res.status, setCookies }
}

/** IP do cliente da requisição em curso (Cloudflare → `cf-connecting-ip`; fallback `x-forwarded-for`). Fora de requisição: null. */
async function resolveClientIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers")
    const h = await headers()
    return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  } catch {
    return null
  }
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    const text = await res.text()
    return text.length ? text : null
  }
  const text = await res.text()
  return text.length ? JSON.parse(text) : null
}

/** Extrai todos os `Set-Cookie` da resposta (para o BFF repassar ao browser). */
function readSetCookies(res: Response): string[] {
  // `getSetCookie` existe no undici (Node 18+/Next). Fallback para o header simples.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie()
  const single = res.headers.get("set-cookie")
  return single ? [single] : []
}

/**
 * Leitura a partir de um Server Component. Repassa os cookies da requisição atual.
 * Não faz refresh automático — em caso de 401, lança `ApiError('unauthorized')` para ser
 * tratado por um boundary de autenticação / redirecionado ao login.
 */
export async function serverApiFetch<T = unknown>(
  path: string,
  init: ApiFetchInit = {},
): Promise<T> {
  const jar = await cookies()
  const cookieHeader = jar.toString()
  const csrfToken = jar.get(COOKIE.csrf)?.value
  const result = await rawApiFetch<T>(path, init, { cookieHeader, csrfToken })
  return result.data
}
