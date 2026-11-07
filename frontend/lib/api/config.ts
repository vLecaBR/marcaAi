/**
 * Configuração central do cliente da API .NET.
 *
 * Fonte da verdade dos nomes de cookie/header — deve espelhar o `Program.cs` do backend
 * (CORS/antiforgery) e o `docs/backend-api.md`. Ver ADR-0001 (BFF com Route Handlers).
 */

import { env } from "@/lib/env"

/**
 * Base URL da API .NET usada no SERVIDOR (BFF/RSC), sem barra final. Prefere `API_INTERNAL_URL`
 * (rede interna do Docker, ex.: `http://api:8080`); sem ela, cai na URL pública. No browser a
 * variável não existe, então vale a pública. Para links do navegador (ex.: "Entrar com Google")
 * use `NEXT_PUBLIC_API_URL` diretamente.
 */
export const API_BASE_URL = (env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL).replace(/\/+$/, "")

/** Prefixo de versão da API. Todas as rotas do inventário (spec §3.2) vivem sob ele. */
export const API_PREFIX = "/api/v1"

/** URL completa da API já versionada: `http://host/api/v1`. */
export const API_URL = `${API_BASE_URL}${API_PREFIX}`

/**
 * Nomes de cookie emitidos pela API .NET.
 * - `at`   → access token (JWT) da sessão, `HttpOnly` (o JS do cliente nunca lê — spec §8).
 * - `csrf` → token de antiforgery, legível pelo servidor Next para casar com o header.
 *
 * O nome do refresh cookie é interno da API e nunca é referenciado pelo front:
 * o refresh acontece via `POST /auth/refresh`, que lê/rotaciona o cookie por conta própria.
 */
export const COOKIE = {
  accessToken: "marcaai_at",
  csrf: "marcaai_csrf",
} as const

/** Header de antiforgery exigido pela API em toda mutation (spec §3.1, §8). */
export const CSRF_HEADER = "X-XSRF-TOKEN"

/** Prefixo do BFF (Route Handlers) por onde passam mutations e leituras client-driven. */
export const BFF_PREFIX = "/api/bff"

/**
 * Métodos HTTP tratados como mutation — exigem injeção do header CSRF.
 * `GET`/`HEAD`/`OPTIONS` são seguros e não carregam antiforgery.
 */
export const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/**
 * Allowlist de prefixos de rota que o BFF catch-all pode encaminhar para a API.
 * Evita que o proxy vire um "open proxy". Espelha o inventário da spec §3.2.
 */
export const BFF_ALLOWLIST: readonly string[] = [
  "me",
  "teams",
  "event-types",
  "schedules",
  "exceptions",
  "slots",
  "bookings",
  "payouts",
  "finance", // Fase 5 — depende do backend (ver docs/backend-backlog.md)
] as const
