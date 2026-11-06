> ✅ **ATUALIZAÇÃO (Fase 5):** NextAuth **exterminado**. Removidos `auth.ts`, `auth.config.ts`,
> `app/api/auth/[...nextauth]/`, `types/next-auth.d.ts` e as deps `next-auth`, `@auth/prisma-adapter`,
> `next-safe-action`. Todo o **dashboard** consome a API .NET (sem Prisma). O Prisma permanece
> **apenas** na superfície pública (Fase 2) e na infra servidor-a-servidor (webhooks/cron/slots/
> scheduling/google + `lib/actions/booking.ts`). Ver seção final.

# Status da remoção do NextAuth (Passo 3 → Fase 1 → Fase 5)

O Passo 3 substituiu o NextAuth na **infraestrutura de rotas e layout**. A migração das telas de
**login/onboarding** e das páginas/actions de dados que ainda usam `@/auth` é trabalho da **Fase 1**
(wiring do login real contra a API .NET: magic link + Google OIDC). Este documento mapeia
exatamente o que já mudou e o que ainda depende do NextAuth, para nada ficar oculto.

## ✅ Migrado (sem NextAuth)

Passo 3 (layout/rotas):

- `app/layout.tsx` — não resolve mais sessão; `AuthProvider` removido.
- `app/(dashboard)/layout.tsx` — protegido via `requireOnboarded()`.
- `app/(dashboard)/dashboard/page.tsx` — guarda via `requireOnboarded()`; dados ainda em Prisma (F5).
- `proxy.ts` (middleware) — gating por cookie `marcaai_at`.
- `lib/auth/guards.ts` — `requireUser` / `requireOnboarded` / `requireTeamAccess`.
- Logout: `app/api/auth/logout/route.ts` + `components/dashboard/logout-button.tsx`.

Fase 1 (login + onboarding):

- **Login** — `app/login/page.tsx` + `components/auth/login-form.tsx` (RHF+Zod). Magic link via
  `POST /api/auth/magic-link`; Google via `/auth/google/start` da API. Sem `useSession`/`signIn`.
- **Callbacks** — `app/auth/verify/route.ts` (magic link → cookies → redirect) e
  `app/auth/callback/route.ts` (pós-Google).
- **Onboarding** — `app/onboarding/page.tsx` (server, `requireUser`) +
  `components/onboarding/onboarding-wizard.tsx` (RHF+Zod+Motion) com campos clínicos
  (`lib/validators/health-profile.ts`). Persiste via BFF (PUT /me/profile → onboarding/complete → refresh).

### 🗑️ Apagados

`components/auth-provider.tsx`, `components/auth/login-card.tsx`, `app/onboarding/actions.ts`.

## ⏳ Ainda depende de NextAuth — migrar na Fase 1

Estas telas/arquivos **não funcionam** até a Fase 1 wire-ar o login pela API (nem o novo caminho
autentica ainda, pois o cookie `marcaai_at` só é emitido pelo login .NET):

| Arquivo | O que fazer (Fase 5 — migração de dados) |
|---|---|
| `app/api/auth/[...nextauth]/route.ts` | Remover; nada mais usa o fluxo NextAuth. |
| `app/page.tsx` | Landing: checar sessão via `getMe()` em vez de `auth()`. |
| `app/(dashboard)/dashboard/**` (bookings, event-types, teams, settings) e `lib/actions/*` | Trocar `auth()` + Prisma por `serverApiFetch`/`apiClient` (BFF). |
| `app/(dashboard)/settings/profile/**` | Reaproveitar o schema `health-profile` na edição de perfil. |

## Ordem sugerida (restante)

1. ✅ Login (magic link + Google) — **feito na Fase 1**.
2. ✅ Onboarding Healthtech — **feito na Fase 1**.
3. Migrar as páginas de dados do dashboard uma a uma (Prisma → API via BFF), removendo `@/auth`.
4. Excluir `auth.ts`, `auth.config.ts`, `app/api/auth/[...nextauth]` e as deps
   `next-auth`/`@auth/*` quando não houver mais referências.

## ✅ Fase 5 concluída — dashboard 100% na API .NET

Migrados para `serverApiFetch` (RSC) + actions-proxy sobre a API:

- Páginas: `dashboard`, `bookings`, `event-types`, `teams`, `teams/[id]` (+ `billing`, `marketing`),
  `settings/availability`, `settings/profile`, `app/page`.
- `lib/actions/*` (event-types, availability, exceptions, team, onboarding, billing) e
  `bookings/actions` viraram **proxies finos** (`serverApiFetch`), sem Prisma/NextAuth, mantendo as
  assinaturas — os componentes client seguem inalterados.
- Helper `lib/api/action-helpers.ts` normaliza `ApiError → { success, error }`.

### ✅ Fase 2 concluída — Prisma exterminado (frontend 100% cliente da API)

Migrados para a API .NET: páginas públicas (`/[username]`, `/[username]/[slug]`, `/booking/[uid]`)
via `GET /public/{username}` e `GET /bookings/{uid}`; slots e criação/cancelamento via proxies
(`/api/slots` → `GET /slots`, `/api/book` → `POST /bookings`, `/api/book/[uid]/cancel`).

**Apagados por completo:** `lib/prisma.ts`, `lib/scheduling/`, `lib/google/`, `lib/email/`,
`lib/whatsapp/`, `lib/payments/`, `lib/actions/booking.ts`, `lib/errors.ts`, `prisma/`,
`prisma.config.ts`, `app/api/webhooks/`, `app/api/cron/`, `emails/`, `event-type-card.tsx`,
scripts de teste com DB. **Deps removidas do `package.json`:** `@prisma/client`,
`@prisma/adapter-pg`, `prisma`, `pg`, `@types/pg` (+ órfãos de e-mail/pagamento), e o
`postinstall` de `prisma generate`. `lib/env.ts` reduzido às URLs públicas.

**Marca temável (ADR-0004):** aplicada só na área pública, com validação de contraste AA em
`lib/brand-theme.ts` — cor do profissional só entra se passar; senão, Teal.

> ⚠️ Zero código Prisma no repositório. O Next é agora um cliente puro da API .NET. Gaps de
> contrato do fluxo público (ownerId no perfil público, endpoint público de clínica) estão em
> `docs/backend-backlog.md`.

### Nota de arquitetura (deviação transitória do ADR-0001)

O ADR-0001 elege Route Handlers (BFF) como padrão de mutation. Nesta fase, as mutations passam por
**Server Actions-proxy finas** que chamam `serverApiFetch` — decisão transitória para não reescrever
~2000 linhas de formulários client. Sem lógica de sessão nelas; fonte de dados 100% .NET. Mover
essas mutations para o BFF é um follow-up de baixo risco.
