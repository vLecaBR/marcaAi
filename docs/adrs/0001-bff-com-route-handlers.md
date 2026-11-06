# ADR-0001 — BFF com Route Handlers (em vez de Server Actions como proxy)

- **Status:** Accepted
- **Data:** 2026-07-25
- **Contexto na spec:** `frontend-healthtech-spec.md` §3.1 e §10.1
- **Decisão relacionada:** ADR-0002 (polling depende do mesmo canal de leitura)

## Contexto

O frontend está migrando de um modelo acoplado (Server Actions + Prisma no próprio Next)
para **cliente de uma API REST versionada** (`/api/v1`) escrita em .NET (Clean Architecture).
A sessão é um **JWT em cookie `HttpOnly`** (`marcaai_at`) emitido pela API, e o backend exige
**antiforgery**: header `X-XSRF-TOKEN` casado com o cookie `marcaai_csrf` (`SameSite=Strict`)
em toda mutation.

A spec (§10.1) deixa em aberto o padrão da camada de escrita: **Server Actions finas como
proxy** vs **Route Handlers como BFF**. Precisamos de um padrão único, porque misturar os dois
espalha a lógica de sessão/CSRF/erro em dois lugares.

## Decisão

Adotar **Route Handlers (`app/api/**/route.ts`) como BFF explícito** para todas as **mutations**
e para leituras acionadas pelo cliente. Leituras server-side (RSC) usam o cliente HTTP direto,
repassando o cookie via `next/headers`. Server Actions ficam reservadas apenas a formulários
triviais sem lógica de sessão.

Padrão único:

- **Leitura em Server Component** → `serverApiFetch()` lê o cookie da requisição e chama a API.
- **Escrita (e leitura client-driven)** → componente cliente chama `/api/bff/...` → Route Handler
  encaminha para a API .NET, injetando CSRF e repassando cookies nos dois sentidos.
- Ponto único para: injeção de `X-XSRF-TOKEN`, ciclo `401 → /auth/refresh → retry`, propagação de
  `Set-Cookie` (rotação de token) de volta ao browser, e normalização de **ProblemDetails**.

## Alternativas consideradas

**A. Server Actions finas como proxy (sugestão original da §3.1).**
O argumento a favor ("manter o cookie fora do JS do cliente") é verdadeiro — mas vale igualmente
para Route Handlers: ambos rodam no servidor Next e o token nunca toca o cliente. Contras:
Server Actions acoplam a mutation ao componente React e ao ciclo de RSC; não têm lugar natural
para o fluxo de refresh de token; dificultam testes isolados; e tornam desajeitado o repasse do
`Set-Cookie` do refresh. Modelam mal o que estamos fazendo — que é **proxy de uma API REST**, não
mutation local.

**B. Chamar a API .NET direto do cliente (sem BFF).**
Rejeitada: exigiria expor o token ao JS (perde o `HttpOnly`) ou depender só de cookies cross-site
com CORS, ampliando a superfície de CSRF e vazando a topologia interna da API ao browser.

## Consequências

**Positivas:** um único ponto de sessão/CSRF/erro; verbos HTTP explícitos; `cache`/`revalidate`
por rota; ProblemDetails repassado sem tradução dupla; refresh de token transparente; testável
com `fetch` mockado.

**Negativas / custos:** um "hop" extra (browser → BFF → API) com latência marginal — aceitável,
pois o BFF roda colocado à app; catch-all precisa de allowlist de rotas para não virar open proxy;
disciplina para **não** reintroduzir Server Actions com lógica de sessão.

**Neutras:** o BFF vive em `app/api/bff/[...path]/route.ts` (catch-all com allowlist) mais handlers
dedicados para casos especiais (ex.: `/api/auth/refresh`, callbacks de pagamento).
