# Fase 0 — Fundação Técnica (plano de implementação)

**Objetivo:** deixar sólido o alicerce que toda tela vai usar — cliente HTTP único, BFF, sessão
(cookie/CSRF/refresh) e tratamento de erro — **antes** de construir qualquer UI. Um bug de refresh
ou de CSRF aqui contamina o app inteiro; por isso esta fase é gargalo e precede as demais.

Referências: `frontend-healthtech-spec.md` §3, §8, §9(F1) · ADR-0001 · ADR-0002.

---

## O que já foi entregue nesta fase

Camada de acesso a dados (`lib/api/`) e esqueleto do BFF (`app/api/`):

| Arquivo | Papel |
|---|---|
| `lib/api/config.ts` | Base URL/prefixo, nomes de cookie (`marcaai_at`/`marcaai_csrf`), header CSRF, allowlist do BFF. |
| `lib/api/problem-details.ts` | Tipo `ProblemDetails` (RFC 7807), classe `ApiError` tipada por `kind` (mapa da §3.4), parser de resposta. |
| `lib/api/types.ts` | DTOs (`MeDto`, enums de pagamento/payout, `ApiResult`). |
| `lib/api/http-client.ts` | **Núcleo** (`rawApiFetch`) + `serverApiFetch` (RSC). Injeção de CSRF, repasse de cookie, coleta de `Set-Cookie`, erros → `ApiError`. `server-only`. |
| `lib/api/endpoints.ts` | Mapa central de rotas da API (§3.2). |
| `lib/api/session.ts` | `getMe()` (guardas de rota) e `refreshSession()` (rotação de token). |
| `lib/api/bff.ts` | `proxyToApi()` — repasse + ciclo `401 → refresh → retry` + propagação de `Set-Cookie`. |
| `lib/api/client.ts` | Cliente do browser: chama o BFF same-origin, normaliza ProblemDetails. |
| `app/api/bff/[...path]/route.ts` | BFF catch-all com allowlist (todos os métodos). |
| `app/api/auth/refresh/route.ts` | Refresh explícito chamável pelo cliente. |
| `lib/env.ts` | + `NEXT_PUBLIC_API_URL` validado por Zod. |

### Fluxo de dados resultante

```
Server Component (leitura)
   └─ serverApiFetch()  ──cookie──►  API .NET /api/v1  ──ProblemDetails──► ApiError

Client Component (escrita / leitura client-driven)
   └─ apiClient()  ──►  /api/bff/*  ──cookie+CSRF──►  API .NET
                          │  401?
                          └─ POST /auth/refresh ──► retry ──► Set-Cookie de volta ao browser
```

---

## Passo a passo (o que falta para fechar a Fase 0)

1. **Ambiente.** Preencher `NEXT_PUBLIC_API_URL` no `.env` (dev: `http://localhost:5080`).
   Confirmar no `Program.cs` da API que a origem do front está no CORS com `AllowCredentials` e que
   os nomes de cookie/header casam com `lib/api/config.ts`.

2. **Type-check real.** `npm install` e `npx tsc --noEmit` (o sandbox aqui não tem `node_modules`;
   os arquivos passaram por transpilação/strip de tipos, falta a checagem cruzada). Adicionar
   script `"typecheck": "tsc --noEmit"` ao `package.json` e ao CI.

3. **Guardas de rota.** No `layout.tsx` do grupo `(dashboard)`, usar `getMe()`:
   `null` → `redirect("/login")`; `onboarded === false` → `redirect("/onboarding")`.
   Espelha as policies do backend (`Onboarded`, `TeamOwner`, `TeamManager`).

4. **Login magic link + Google.** Handlers finos: `POST /api/bff/... ` não serve auth (não está na
   allowlist); a request de magic link vai por um handler dedicado em `app/api/auth/*` ou direto no
   Server Action de formulário chamando `rawApiFetch`. Os callbacks Google (`/auth/google/complete`)
   são redirects do backend — o front só trata o retorno.

5. **Migrar leituras/escrituras básicas (F1 da spec):** perfil (`/me`), event types, agenda —
   trocando as actions Prisma por `serverApiFetch` (leitura) e `apiClient` (escrita via BFF).
   Congelar `lib/prisma.ts` e `lib/actions/*` legados à medida que forem substituídos.

6. **Design system base.** Tokens da §4.2 como CSS vars no `globals.css`/`tailwind.config.ts`
   (substituir default roxo pelo teal — ADR-0004), tipografia Inter/Source Sans, foco visível,
   alvos ≥ 44px (§4.3). Instalar `next-intl` com `messages/pt-BR.json` (ADR-0005).

7. **Testes de fundação.** `vitest` cobrindo: injeção de CSRF só em mutations; `ApiError.kind`
   por status (401/409/422/502); `applySetCookies` (merge de rotação); e um teste de integração do
   BFF simulando `401 → refresh → retry` com `fetch` mockado.

---

## Critérios de aceite da Fase 0

- Uma leitura em RSC e uma escrita via BFF funcionam ponta a ponta contra a API .NET local.
- Sessão expirada no meio de uma escrita é renovada de forma transparente (sem erro ao usuário).
- Nenhum token de sessão acessível ao JS do cliente (cookie `HttpOnly`; §8).
- Todo erro da API chega à UI como `ApiError` com `kind` mapeável para copy (§3.4).
- `tsc --noEmit` limpo e testes de fundação verdes.

---

## Notas de arquitetura

- **Por que RSC não faz refresh:** durante o render de um Server Component os cookies são
  read-only; a rotação de token exige reescrever `Set-Cookie`, o que só um Route Handler (BFF)
  pode fazer. Por isso o `serverApiFetch` apenas propaga 401, e o retry-com-refresh vive no BFF.
- **Allowlist do BFF:** o catch-all só encaminha prefixos conhecidos (`BFF_ALLOWLIST`) para não
  virar open proxy. Novos domínios de API entram lá conscientemente.
- **`finance/*` já está na allowlist** mas depende do backend (ADR-0003 / `backend-backlog.md`) —
  não haverá tela até os endpoints existirem (Fase 5).
