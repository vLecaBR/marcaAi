# MarcaAí Frontend — Spec de Continuação (checkpoint de arquitetura)

**Propósito:** este documento é **autossuficiente**. Um novo chat deve conseguir continuar o projeto
tendo **apenas** este arquivo como base, sem reler todo o histórico. Contém o estado atual, todas as
rotas/DTOs/decisões já implementadas, o contrato de API vigente, os gaps de backend e a **spec
detalhada da Fase 8** (próximo foco; a Fase 7 está concluída — §7).

**Última atualização:** 2026-07-28 — Fases 0 a 6.2 concluídas; **Fase 7 (Polimento Healthtech &
UX) CONCLUÍDA**; **Fase 8 (Planos + Free Trial) ESTRUTURAL ENTREGUE** no frontend (config de planos,
`TeamBillingDto` estendido, `PremiumGate`, `TrialBanner`, `TeamUsageStats`, tela de planos e pricing
público — tudo em **mock-com-fallback**; a integração real depende dos gaps de billing/trial abertos
em `docs/backend-backlog.md`); **Fase 8.5 (Health System Visual & Brand Revamp) CONCLUÍDA** — legado
Violet/Zinc **erradicado** (busca global por `violet`/`fuchsia` retorna zero), landing revampada,
tech-debts de UI da §6 quitados e Design System consolidado em primitivas únicas (Button/Input/
Dialog/MotionModal/skeletons); decisão registrada no **ADR-0006 (Design System Healthtech)**. **7.6
(i18n) e 7.7 (Testes) seguem na Fase 9 (backlog — §9)**. Próximo foco: **Fase 9 — i18n + Testes**.

**Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript strict · Tailwind v4 (CSS-first) ·
Framer Motion (`motion` v12) · React Hook Form + Zod · recharts 2.15.2. Backend: API .NET 10 (Clean
Architecture), base dev `http://localhost:5080`, prefixo `/api/v1`. **O frontend é 100% cliente da
API** — não há Prisma, NextAuth nem lógica de banco no repo.

---

## 1. Estado atual — Fases 0 a 6.2 ✅

| Fase | Escopo | Rota(s) | Status |
|---|---|---|---|
| **F0** | Fundação: cliente HTTP, BFF, ProblemDetails | — | ✅ |
| **F1** | Auth (magic link + Google, sem NextAuth) + Onboarding Healthtech | `/login`, `/onboarding`, `/auth/*` | ✅ |
| **F2** | Superfície pública (perfil, serviço, booking) | `/[username]`, `/[username]/[slug]`, `/booking/[uid]` | ✅ |
| **F3** | Pagamento (checkout PIX + Stripe Elements + polling) | `/booking/[uid]/pay` | ✅ |
| **F4** | Recebimentos (onboarding de PayoutAccount) | `/dashboard/recebimentos` | ✅ |
| **F5** | Dashboard Financeiro (métricas de negócio SaaS) | `/dashboard/financeiro` | ✅ |
| **F6** | Gestão de Clínica & Equipe (membros, papéis, convites, RBAC) | `/dashboard/team` | ✅ |
| **F6.2** | Financeiro da Clínica (consolidado + receita por profissional) | `/dashboard/team/financeiro` | ✅ |
| **F7** | Polimento Healthtech (skeletons, empty states, responsividade, A11y, copy) | (transversal) | ✅ **concluída** (7.1–7.5 ✅ · 7.6/7.7 → **F9**) |
| **F8** | Regras de Planos no Frontend **+ Free Trial de 30 dias** (limites, valores, gating premium, trial) | (transversal + `/dashboard/*` + `/dashboard/team/plans` + landing) | ✅ **estrutural entregue** (UI + mock-com-fallback; integração real depende dos gaps §4) |
| **F8.5** | **Health System Visual & Brand Revamp** (erradicar Violet/Zinc → DS Teal clínico; landing; tech-debt de UI; padronização de botões/inputs/modais/skeletons) | (transversal + landing + design system) | ✅ **concluída** (ADR-0006; zero `violet`/`fuchsia`; detalhes em §8.5) |
| **F9** | **i18n** (next-intl) + **Testes automatizados** (vitest/Playwright) — qualidade & escala | (transversal · `frontend/`) | ⬜ **próximo** (escopo detalhado em §9) |

O "Extermínio" (remoção de Prisma, NextAuth, scheduling, webhooks, cron e limpeza do `package.json`)
foi concluído junto à migração do dashboard. Toda a superfície consome a API .NET.

### 1.1 F4 — Recebimentos ✅
- **Rota:** `/dashboard/recebimentos`. **Guarda:** `requireOnboarded()`.
- **Objetivo:** o profissional ativa a conta de recebimento (split das consultas) e vê saldo/saques.
- **Componentes:** `components/payouts/{payout-status-card,payout-balance-card,fee-transparency}.tsx`.
- **DTOs:** `lib/api/payout-types.ts` (`PayoutAccountDto`, `PayoutOnboardingResponse`,
  `PayoutBalanceDto`, `PayoutTransactionDto`).
- **Actions:** `lib/actions/payouts.ts`. **Mocks:** `lib/mocks/payouts.ts` (saldo/saques mockados —
  `POST /payouts/onboarding`, `DELETE /payouts/{id}` são reais).
- **UX:** badge de status (`ACTIVE`→verde `care`, `PENDING`→`warning`, `RESTRICTED`→`destructive`),
  CTA "Ativar recebimentos" → abre `onboardingUrl`, fee transparente.

### 1.2 F5 — Dashboard Financeiro (do profissional) ✅
- **Rota:** `/dashboard/financeiro`. **Guarda:** `requireOnboarded()`.
- **Componentes:** `components/finance/{metric-cards,revenue-chart}.tsx`.
- **DTOs:** `lib/api/finance-types.ts` (`MetricsSummaryDto`, `RevenuePointDto`, `FinanceDashboardDto`).
- **Mocks:** `lib/mocks/metrics.ts`. **Endpoint:** `GET /finance/summary` → **fallback mock** com selo
  "Dados de demonstração".
- **Gráfico:** recharts (área bruto × líquido, 12 meses, gradiente Teal/azul, pt-BR/BRL). Cores de
  marca por **hex** (`#0f9e8e`/`#134e6f`) — recharts não lê classes Tailwind.
- **⚠️ Decisão de escopo:** a spec original (§6) descrevia a F5 como *ganhos do profissional*
  (líquido/pendente/taxas por consulta). O produto pediu **métricas de negócio SaaS** (MRR/Churn/LTV
  + faturamento). Seguimos o pedido e criamos um **DTO dedicado** (`MetricsSummaryDto`). A visão de
  **extrato por consulta** (`GET /finance/statement`) permanece disponível para somar depois, sem
  conflito de contrato.

### 1.3 F6 — Gestão de Clínica & Equipe ✅
- **Rota (hub):** `/dashboard/team` (singular — resolve a **clínica principal** do usuário via
  `GET /teams` → primeiro item → `GET /teams/{id}`). **Guarda:** `requireOnboarded()`; o **RBAC fino é
  do backend** (403/404 → tratado).
- **Componentes (novos, paleta Teal):** `components/team/{clinic-members,role-badge,clinic-tabs}.tsx`.
  - `clinic-members.tsx` (client): lista de profissionais, convite (**RHF + Zod**), troca de papel
    (select) e remoção — tudo com **estado local otimista** e `router.refresh()`.
  - `role-badge.tsx`: selo por papel — `OWNER` Teal, `ADMIN` azul (`brand-secondary`), `MEMBER` neutro.
  - `clinic-tabs.tsx`: sub-nav Equipe · Financeiro (a aba Financeiro só aparece para OWNER/ADMIN).
- **Actions:** `lib/actions/team.ts` — `upsertTeamAction`, `inviteTeamMemberAction`,
  `removeTeamMemberAction` e o novo **`updateTeamMemberRoleAction`** (`PUT /teams/{id}/members/{userId}`).
- **Validators:** `lib/validators/team.ts` — adicionado `updateMemberRoleSchema`.
- **Mocks:** `lib/mocks/team.ts` (`MOCK_CLINIC`, com membros e papéis) → fallback quando o usuário
  ainda não tem clínica; em demo as ações atualizam só o estado local.
- **RBAC (visibilidade):** `canManage = OWNER || ADMIN`. Convite/troca de papel/remoção só aparecem
  para gestores; **nunca** sobre a linha do `OWNER` nem sobre o próprio usuário. Promoção limita-se a
  `MEMBER ⇄ ADMIN` (transferência de propriedade é fluxo à parte, v2).
- **Navegação:** o item de nav "Clínica**s**" foi **repontado** para `/dashboard/team` e renomeado
  para **"Clínica"** (mantém 6 itens no bottom nav mobile). A lista de todas as clínicas
  (`/dashboard/teams`, legado) segue acessível pelo link "Ver todas as clínicas" dentro do hub, que só
  aparece se o usuário pertence a mais de uma.
- **⚠️ Decisão de escopo:** a spec original rotulava a F6 como *"Financeiro da Clínica"*. O plano de
  ação priorizou **gestão de equipe** (RBAC/convites/papéis), que casa com as rotas `/teams`. O
  financeiro da clínica virou **F6.2** (abaixo).

### 1.4 F6.2 — Financeiro da Clínica ✅
- **Rota:** `/dashboard/team/financeiro` (**aba dentro do hub**, não `/dashboard/teams/{id}/financeiro`).
  **Guarda:** `requireOnboarded()` **+ RBAC por papel** (renderização condicional).
- **Componentes:** `components/finance/{team-finance-summary,professional-revenue-list}.tsx` +
  `components/team/clinic-tabs.tsx`.
  - `team-finance-summary.tsx`: cards (líquido total, taxas MarcaAí, ticket médio, consultas pagas) +
    strip de **plano/fee vigente** ("plano maior, fee menor: Solo 3,49% · Clínica 2,49% · Pro 1,99%").
  - `professional-revenue-list.tsx`: tabela densa (avatar, nome, selo de papel, consultas, líquido) com
    linha de **Total da clínica**. Coluna **"Sua fatia"** reservada com selo "em breve" (rateio interno
    é v2 — depende de `RevenueShareRule`).
- **DTOs (novos em `finance-types.ts`):** `TeamFinanceSummaryDto`, `ProfessionalRevenueDto`,
  `TeamPlanDto`.
- **Mocks:** `lib/mocks/team-finance.ts` (`MOCK_TEAM_FINANCE`). **Endpoint:**
  `GET /finance/teams/{teamId}/summary` → **fallback mock** com selo "Dados de demonstração".
- **RBAC estrito:** `canSeeFinance = OWNER || ADMIN`. O `MEMBER` **não vê a aba** e, se navegar direto
  para a URL, recebe uma tela **"Acesso restrito"** (não vaza o faturamento dos colegas).

### 1.5 Robustez & deploy — ajustes de 2026-07-27
- **Degradação graciosa quando o backend está fora** (evita 500 na home/pública):
  - `lib/api/session.ts` → `getMe()` trata `network`/`server` (além de `unauthorized`) como "sem sessão"
    (retorna `null`), para a landing e as guardas renderizarem mesmo com a API indisponível.
  - `app/(public)/[username]/page.tsx` → `getProfile()` trata `network`/`server` como "não encontrado"
    (mostra o 404 amigável em vez de estourar).
- **Config de API:** `NEXT_PUBLIC_API_URL` estava ausente do `.env`/`.env.example` (caía no default
  `http://localhost:5080` de `lib/env.ts`) — agora documentada. Base **sem** `/api/v1` e sem barra final;
  o front acrescenta `/api/v1` (`lib/api/config.ts`). Na Vercel, apontar para a URL pública do backend.
- **Backend pronto para deploy em container** (Render/Docker): adicionados `backend/Dockerfile`
  (multi-stage .NET 10) e `backend/.dockerignore`; `Program.cs` ganhou `UseForwardedHeaders` (TLS
  terminado no proxy — evita loop de `UseHttpsRedirection` e garante `Secure` nos cookies) e
  **migrations no boot** (`db.Database.Migrate()`). Banco sugerido: **Supabase (Session pooler, 5432)** em
  formato Npgsql. Cookies de sessão seguem `SameSite=Strict` **funcionando** porque o BFF/refresh reemite
  o `Set-Cookie` como **first-party** no domínio do front (browser↔Next é same-origin; Next↔API é
  server-to-server). Login por **magic link** é o caminho recomendado; **Google OAuth** cross-domain exige
  cuidado extra (callback no domínio da API) — revisar quando ativar.

---

## 2. Convenções e arquitetura (leia antes de codar)

### 2.1 Camada de API (`lib/api/`)
- **`http-client.ts`** — `serverApiFetch<T>(path, init)` (RSC/server; repassa cookie, lança `ApiError`)
  e `rawApiFetch` (núcleo, cookie/CSRF explícitos; usado por proxies e BFF). `server-only`.
- **`client.ts`** — `apiClient<T>(path, init)`: client-side, chama o BFF same-origin `/api/bff/*`.
- **`endpoints.ts`** — **mapa único de rotas da API**. Adicione novas rotas aqui (nunca strings soltas).
- **`problem-details.ts`** — `ApiError` com `kind`: `unauthorized | forbidden | not_found | conflict |`
  `validation | payment_provider | network | server | unknown`. `isApiError()`.
- **`action-helpers.ts`** — `apiAction`/`callApi` normalizam para `{ success, error }` (usados nas
  Server Actions-proxy). `types.ts`, `booking-types.ts`, `payout-types.ts`, `finance-types.ts` — DTOs.

### 2.2 Padrões de leitura/escrita (ADR-0001)
- **Leitura** em RSC → `serverApiFetch` direto na página.
- **Escrita** → **Route Handlers do BFF** (`app/api/bff/[...path]`, allowlist em `config.ts`) via
  `apiClient`. Transitoriamente, mutations do dashboard usam **Server Actions-proxy finas**
  (`lib/actions/*`) que chamam `serverApiFetch` — mesma assinatura `{success,error}`; migrar ao BFF é
  follow-up de baixo risco (ver §6 tech-debt).
- **Público/sem sessão** → proxies dedicados em `app/api/book/*` e `app/api/slots`.

### 2.3 Sessão e guardas (`lib/auth/guards.ts`)
- Cookie `HttpOnly` `marcaai_at` emitido pela API; CSRF header `X-XSRF-TOKEN` ⟷ cookie `marcaai_csrf`.
- Refresh só em Route Handler (`/api/auth/refresh`) — RSC não reescreve cookie.
- `requireUser()` (sem sessão → `/login`), `requireOnboarded()` (sem onboarding → `/onboarding`),
  `requireTeamAccess(id, min)` (**probe** em `GET /teams/{id}`: 401→login, 403/404→`notFound`; valida
  papel mínimo local se o DTO trouxer `role`). Middleware `proxy.ts` faz gating grosseiro por cookie.

### 2.4 Padrão de **mocks com fallback gracioso** (F4–F6.2)
Enquanto endpoints de backend não estão finalizados, cada tela segue o **mesmo padrão**:
1. DTO **definitivo** em `lib/api/*-types.ts` (a assinatura não muda ao plugar o real).
2. Mock em `lib/mocks/*.ts` marcado com `MOCK_` (grep-ável para remoção).
3. Na página RSC: `try { serverApiFetch(...) } catch { /* mantém mock */ }`, com flag `isDemo`.
4. **Selo visual** "Dados de demonstração" (`bg-warning/10 text-warning` + ícone `FlaskConical`) e uma
   nota de rodapé explicando que a tela passa a refletir dados reais automaticamente.
5. Em telas com ação (ex.: clínica em demo), as mutations atualizam **estado local otimista** e não
   chamam o backend (`isDemo` curto-circuita antes da action).

Plugar o backend real = deletar/ignorar o mock; **a UI e as chamadas já são as definitivas**.

### 2.5 Padrão de **RBAC no front**
Dois níveis, sempre com o **backend como fonte da verdade**:
- **Guarda de rota** (probe): `requireTeamAccess(teamId, "manager")` para rotas por-id.
- **Renderização condicional** por papel (`role` do `TeamDetailDto`): esconder ações destrutivas e
  seções sensíveis (ex.: `canSeeFinance = OWNER || ADMIN`; `MEMBER` recebe "Acesso restrito"). É
  **defesa em profundidade** — o backend ainda valida cada request.

### 2.6 Design system (Tailwind v4, `app/globals.css`)
- Tokens Healthtech em CSS vars, expostos via `@theme inline` como utilitários:
  `--brand-primary`(#0f9e8e teal), `--brand-secondary`(#134e6f azul), `--accent-care`(→`care`),
  `--warning`(âmbar), `--danger`(→`destructive`), `--surface`, `--secondary`(teal claro).
  Utilitários confirmados: `bg-brand-primary`, `text-brand-primary`, `text-brand-secondary`,
  `text-care`, `bg-warning`/`text-warning`, `text-destructive`, `bg-secondary`, `bg-surface`, `bg-card`,
  `border-border`, `text-muted-foreground`. **Tema claro/escuro** via segunda paleta em `.dark`.
- **Cor de marca (ADR-0004):** só na área **pública**. `lib/brand-theme.ts` → `safeBrandColor(hex)`
  valida contraste AA vs branco; falhou → Teal. Aplicada via CSS var `--brand` no wrapper da página.
- **Acessibilidade:** WCAG AA, foco visível, alvos ≥44px, `prefers-reduced-motion` respeitado.
- **Formatação monetária:** `formatBRLCents(cents)` em `lib/utils.ts` (`Intl.NumberFormat` pt-BR/BRL).
  **O front nunca soma centavos** — agregação é sempre do servidor.

### 2.7 Animação (`components/motion/`)
- `MotionProvider` (LazyMotion `domAnimation` + `MotionConfig reducedMotion="user"`) já no root layout.
- Use `m.*` (não `motion.*`). Primitivas: `FadeIn`, `Stagger`/`StaggerItem`, `Pressable`, `MotionModal`.

### 2.8 Regras de código invioláveis
- Formulários = **sempre** RHF + Zod (nunca `useState` cru para forms — a versão legada em
  `teams/[id]/components/team-members-list.tsx` é a exceção a ser migrada, §6).
- Rotas de API só via `endpoints.ts`. Erros sempre via `ApiError`/`isApiError`.
- Strings de UI em pt-BR; a extração para i18n é **F9** (ADR-0005).
- **Verificação:** `npx tsc --noEmit` **e** `npm run lint` **e** `npm run build` limpos antes de
  commit. Regras de lint que já morderam: `react-hooks/immutability` (use `window.location.assign()`,
  não atribuição a `.href`); `react-hooks/rules-of-hooks` (evite parâmetros chamados `use` — ex.:
  fixtures Playwright → renomeie para `provide`); remova `eslint-disable` não utilizados.

---

## 3. Contrato da API relevante (resumo)

| Domínio | Rotas |
|---|---|
| Perfil | `GET /auth/me` · `PUT /me/profile` · `POST /me/onboarding/complete` |
| Serviços | `GET/POST /event-types` · `PUT/DELETE /event-types/{id}` · `PATCH /event-types/{id}/status` |
| Agenda | `GET /schedules` · `PUT /schedules/{id}/availability` · `POST /schedules/{id}/exceptions` · `DELETE /exceptions/{id}` |
| Slots/Booking | `GET /slots` · `POST /bookings` · `GET /bookings/{uid}` · `POST /bookings/{uid}/cancel` · `POST /bookings/{uid}/pay` |
| Público | `GET /public/{username}` · `GET /public/team/{slug}` (a criar — §4) |
| **Clínicas** | `GET/POST /teams` · `GET/PUT /teams/{id}` · `POST/DELETE /teams/{id}/members[/{userId}]` · **`PUT /teams/{id}/members/{userId}`** (troca de papel — a criar, §4) |
| Billing SaaS | `GET /teams/{teamId}/billing` · `POST /teams/{teamId}/billing/checkout` |
| Recebimentos (F4) | `POST /payouts/onboarding` · `GET /payouts` · `GET /payouts/{provider}/status` · `GET /payouts/teams/{teamId}` · `DELETE /payouts/{id}` |
| Financeiro (F5/F6.2 — a criar no backend) | `GET /finance/summary` · `GET /finance/statement` · **`GET /finance/teams/{teamId}/summary`** |

**Mapa em código:** `lib/api/endpoints.ts` (namespaces `auth`, `me`, `teams`, `eventTypes`,
`schedules`, `slots`, `public`, `bookings`, `payouts`, `finance`). `endpoints.teams.member(id,userId)`
é reusado com método `PUT` para a troca de papel.

**Enums:** `PaymentStatus: UNPAID|PAID|REFUNDED` (+ `PENDING|PARTIALLY_REFUNDED|FAILED` no snapshot);
`PayoutAccountStatus: PENDING|ACTIVE|RESTRICTED`; `TeamRole (TeamRoleName): OWNER|ADMIN|MEMBER`.

### 3.1 DTOs financeiros novos (F6.2) — `lib/api/finance-types.ts`
```jsonc
// GET /finance/teams/{teamId}/summary
{ "teamId": "…", "currency": "BRL", "period": "Julho de 2026",
  "netTotalCents": 0, "platformFeesCents": 0, "avgTicketCents": 0, "paidBookingsCount": 0,
  "byProfessional": [
    { "userId": "…", "name": "…", "role": "OWNER|ADMIN|MEMBER",
      "netCents": 0, "paidBookingsCount": 0, "shareCents": null } // shareCents = v2 (rateio)
  ],
  "plan": { "planCode": "SOLO|CLINICA|PRO", "quantity": 5, "defaultFeeBps": 249 } }
```

---

## 4. 🔴 Gaps de backend abertos (de `docs/backend-backlog.md`)

Referência canônica: **`docs/backend-backlog.md`**. Resumo dos que bloqueiam/limitam telas:

1. **`FinanceController`** com `GET /finance/summary`, `GET /finance/statement`,
   **`GET /finance/teams/{teamId}/summary`** projetando o snapshot imutável do Booking (`PriceCents`,
   `PlatformFeeCents`, `NetToProviderCents`, `PaymentProvider`, `PaidAt`, `RefundedAt`). Sem ele, F5 e
   F6.2 rodam em **demonstração** (mock com fallback). Auth: `Onboarded` (summary/statement) e
   `TeamOwner`/`TeamManager` (team summary).
2. **`PUT /teams/{id}/members/{userId}`** (troca de papel `MEMBER ⇄ ADMIN`) — a UI já expõe o seletor
   (F6), gated no cliente; falta persistir. Regras: só OWNER/ADMIN; nunca o OWNER nem o próprio
   usuário; promover a OWNER é fluxo separado. Auth: `TeamOwner`/`TeamManager`.
3. **`GET /public/{username}` deve expor `ownerId`** — necessário para `/slots` e `/bookings` públicos.
4. **`POST /bookings/{uid}/confirm`** (aprovação manual) — hoje desabilitada no front.
5. **`GET /event-types/{id}` detalhado** (buffers, `questions`) e `POST /bookings` aceitando
   `responses`/`recurringCount`.
6. **`GET /me/profile`** autenticado (name/bio/brandColor) — hoje pré-preenche via `/public/{username}`.
7. **`GET /public/team/{slug}`** — `/team/[slug]` está em placeholder.
8. **Estender `UpdateProfileInput`** com `specialty/council/registrationNumber/clinicName`.
9. **Rateio interno da clínica (v2)** — `RevenueShareRule` para a coluna "sua fatia" (F6.2 já reserva o
   espaço, sem cálculo).

---

## 5. Mapa de rotas do dashboard (estado atual)

```
/dashboard                         Início
/dashboard/bookings                Meus agendamentos
/dashboard/event-types             Tipos de consulta
/dashboard/recebimentos            Recebimentos (F4)
/dashboard/financeiro              Financeiro do profissional (F5)
/dashboard/team                    Clínica — hub (F6)  ← nav "Clínica"
/dashboard/team/financeiro         Financeiro da clínica (F6.2, RBAC OWNER/ADMIN)
/dashboard/teams                   [legado] lista de clínicas (paleta violet/zinc — migrar)
/dashboard/teams/[id]              [legado] detalhe de clínica (+ billing, marketing)
/settings/profile                  Perfil
/settings/availability             Disponibilidade
```
Layout protegido em `app/(dashboard)/layout.tsx` (sidebar desktop + bottom nav mobile de 6 itens,
`NavLink` com estado ativo). **Guarda do grupo:** `requireOnboarded()`.

---

## 6. 🧹 Tech-debt conhecido (endereçar em F7 ou depois)

- **Legado de clínica (→ agora escopo da F8.5, §8.5.3):** `/dashboard/teams` (lista) e
  `/dashboard/teams/[id]` ainda usam `team-members-list.tsx` na paleta **violet/zinc** (fora do
  padrão) e **`useState` cru** no convite. Migrar para os componentes Teal de `components/team/`
  (RHF+Zod) e decidir se a lista some ou vira seletor de clínicas.
- **`TeamForm` + `checkout-button.tsx` (→ F8.5, §8.5.3):** modal zinc-950/violet e botão violet a
  repadronizar no DS Teal (preservando o banner de trial já inserido na F8.2).
- ~~**`nav-link.tsx`:** estado ativo desktop em violet~~ → **resolvido na F7.4** (agora
  `bg-brand-primary/10 text-brand-primary`).
- **Server Actions-proxy → BFF:** migrar `lib/actions/*` para Route Handlers do BFF (baixo risco).
- **Tipos `any`:** `components/booking/booking-form.tsx` tem `questions?: any[]`, `pixData?: any` e
  `register(... as any)` — tipar quando o contrato de `questions` estabilizar.
- **`/team/[slug]` público:** placeholder até `GET /public/team/{slug}` (gap §4.7).

---

## 7. ✅ Fase 7 — Polimento Healthtech & UX (CONCLUÍDA)

**Meta (atingida):** deixar todas as telas com carregamento, vazio e responsividade impecáveis,
acessíveis (AA) e com copy acolhedora — sem novas features de negócio. **7.1–7.5 entregues**; 7.6 (i18n)
e 7.7 (testes) foram movidas para a **Fase 9 (backlog — §9)**. Cada bloco abaixo registra o que foi
feito e seu critério de aceite.

### 7.1 Skeletons & estados de carregamento ✅
- **Entregue:** conjunto reutilizável em `components/ui/skeletons/index.tsx` (client) com pulsação suave
  via **Framer Motion** (opacidade em loop, paleta Teal `bg-brand-primary/10` — em vez do `animate-pulse`),
  respeitando `reducedMotion="user"` herdado do `MotionProvider`. Primitivas: `SkeletonBlock` (base),
  `CardSkeleton`, `MetricCardSkeleton`, `TableRowSkeleton`, `ListItemSkeleton`.
- **Entregue:** `loading.tsx` (App Router) para as **rotas pesadas** espelhando o layout final, sem
  layout shift perceptível: `dashboard/financeiro` (header + grade de 6 MetricCards + área do gráfico) e
  `dashboard/team` (tabs + header + card de profissionais + área de convite).
- **Pendência menor (F7.3+):** replicar `loading.tsx` nas rotas restantes reutilizando as primitivas:
  `dashboard`, `bookings`, `event-types`, `recebimentos`, `team/financeiro`. Onde houver múltiplas seções
  server-fetch, avaliar `<Suspense>` com fallback próprio (streaming).
- **Aceite:** nenhuma tela do dashboard "pisca" em branco; skeleton tem o mesmo esqueleto/altura do
  conteúdo real (sem layout shift perceptível). *Cumprido nas rotas pesadas; demais rotas na pendência acima.*

### 7.2 Empty states acolhedores ✅
- **Entregue:** componente global reutilizável `components/ui/empty-state.tsx` (ícone Teal em círculo +
  título + copy de apoio + **slot `action` opcional** para CTA), na paleta Teal. É **server-safe** (sem
  `"use client"`, sem handlers): o CTA entra pelo slot, aceitando `<Link>`/`<Button asChild>` (RSC) ou
  `<Button onClick>` (client) — reutilizável em qualquer contexto.
- **Entregue (aplicações):**
  - **Membros da Equipe** (`components/team/clinic-members.tsx`): lista vazia → empty state com CTA
    "Convidar profissional" (foca o campo de e-mail via `setFocus` do RHF; só para OWNER/ADMIN).
  - **Recebimentos** (`components/payouts/payout-balance-card.tsx`): lista de movimentações vazia →
    empty state (ícone `Receipt`). Sem CTA, pois nenhuma ação da tela gera transação; a ativação de conta
    já tem CTA próprio no `PayoutStatusCard`.
- **Pendência menor (F7.3+):** aplicar o `EmptyState` nos demais casos previstos — **sem agendamentos**,
  **sem tipos de consulta** (CTA "Criar primeira consulta"), **financeiro sem dados no período**, e o caso
  **"não há clínica real"** (hoje cai no `MOCK_CLINIC`; avaliar empty state "Crie sua clínica" quando
  não-demo e sem clínica).
- Copy: tom acolhedor, sem jargão, orientada à ação.
- **Aceite:** todo estado vazio tem ícone + título + apoio + (quando fizer sentido) CTA; nenhum "0" seco
  ou tabela vazia sem mensagem. *Cumprido nas listas aplicadas; demais casos na pendência acima.*

### 7.3 Responsividade mobile (mobile-first) ✅
- **Entregue — Tabelas → cartões:** `professional-revenue-list.tsx` agora renderiza a **tabela densa
  em `sm+`** (`hidden sm:block`) e **cards empilhados em `<sm`** (`sm:hidden`) — avatar + nome + papel
  à esquerda, líquido + nº de consultas à direita, com card de "Total da clínica". Zero scroll
  horizontal. Padrão a reusar na futura `statement-table`.
- **Entregue — Equipe legada:** `teams/[id]/components/team-members-list.tsx` corrigido para mobile:
  nome/e-mail com `min-w-0`+`truncate`, controles `shrink-0`, e o form de convite empilha em `<sm`
  (`flex-col sm:flex-row`) em vez de espremer input+select+botão numa linha. (Paleta zinc/violet
  legada mantida — migração para Teal segue como tech-debt §6.)
- **Auditado e OK:** `clinic-members.tsx` (stacka em `<sm`, alvos ≥44px), grids de métricas
  (`grid-cols-1 sm:2 lg:3/4`), gráfico recharts (`ResponsiveContainer width="100%"`), headers com
  botão (`flex-col sm:flex-row` + `shrink-0`).
- **Aceite:** zero overflow horizontal; toques confortáveis; nenhuma informação crítica cortada em
  360px. *Cumprido.*

### 7.4 Acessibilidade AA ✅
- **Entregue:** `nav-link.tsx` migrado de violet (`bg-violet-50`/`text-violet-400`) para **Teal**
  (`bg-brand-primary/10 text-brand-primary`) no estado ativo desktop — resolve off-palette e garante
  contraste AA. O nav mobile já usava `text-primary` (= `--brand-primary`, Teal) — sem mudança.
- **Verificado:** foco visível consistente (`focus-visible:ring` Teal nos controles), `aria-label` nos
  selects/botões de ação de `clinic-members.tsx`, `aria-current` nas tabs da clínica,
  `prefers-reduced-motion` herdado do `MotionProvider` (skeletons respiram só em opacidade).
- **Aceite:** navegação por teclado nos fluxos críticos; foco sempre visível; contraste AA nas
  superfícies de marca (o legado zinc/violet de `team-members-list.tsx` fica como tech-debt §6, mas já
  sem overflow mobile). *Cumprido.*

### 7.5 Copy Healthtech (spec de negócio §5) ✅
- **Entregue:** copy acolhedora e orientada à ação aplicada nos empty states de agendamentos, tipos de
  consulta, onboarding de clínica e financeiro sem dados (tom sem jargão, nunca diagnostica). A
  transparência da **confirmação de pagamento assíncrona** segue nas telas de booking/pagamento.
- **Aceite:** empty states e estados de carregamento com copy humana; mensagens de erro seguem
  mapeadas por `ApiError.kind`. *Cumprido no escopo revisado.*

> **7.6 (i18n) e 7.7 (Testes) foram movidas para a Fase 9 (backlog — §9).** Não fazem parte do escopo
> de polimento entregue na F7; o detalhamento vive agora na §9 para manter esta seção fiel ao que foi
> de fato concluído.

---

## 8. 🎯 Fase 8 — Regras de Planos no Frontend + Free Trial (ESTRUTURAL ENTREGUE)

A camada de **UI e contratos** da Fase 8 foi entregue (em mock-com-fallback §2.4); a integração real
aguarda os gaps de billing/trial do backend (§4 · "BLOQUEIA FASE 8"). Tem **dois focos
complementares**: (8.1) **Regras de Negócio de Planos** — exibir limites, valores de assinatura
corretos e **bloquear features premium** conforme o plano; e (8.2) **Free Trial de 30 dias** — toda
nova conta/clínica começa com premium liberado por 30 dias, com UI clara de trial e expiração.

**Entregue no frontend (2026-07-27):** `lib/plans/plan-config.ts` (mapa único SOLO/CLINICA/PRO —
preço, fee, limites, features premium, helpers de gating); `lib/api/billing-types.ts`
(`TeamBillingDto` estendido: plano, status, `trial`, `usage`, `limits`) + mock
`lib/mocks/billing.ts` (trial de 30 dias) + leitura `lib/api/billing.ts` com fallback;
`components/billing/` → `PremiumGate`, `TrialBanner`, `TeamUsageStats`, `PlanActionButton`; tela
`/dashboard/team/plans` (pricing table com plano atual/upgrade/downgrade); pricing público
`components/marketing/pricing-section.tsx` na landing (consome o mesmo `PLAN_CONFIG`); banner de
trial no `TeamForm`. **Pendente:** trocar o mock pelo backend real quando os gaps de billing/trial
(§4) forem fechados — a UI e as chamadas já são as definitivas.

É transversal e depende do contrato de billing do backend (ver §3 · `GET /teams/{teamId}/billing`). O
front deve tratar tudo com o padrão de **mocks com fallback gracioso** (§2.4) e **RBAC/gating no front
como UX** (§2.5) — a **fonte da verdade do plano, dos limites e do trial é sempre o backend**; o front
nunca "libera" um recurso por conta própria. **Pré-requisito:** estabilizar o `TeamBillingDto`
(incluindo o estado de trial) e abrir os gaps de billing/trial em `docs/backend-backlog.md` antes de
codar a lógica real.

### 8.1 Regras de Negócio de Planos no Frontend
**Meta:** a interface refletir com precisão o plano vigente da clínica/profissional — mostrando limites,
valores corretos de assinatura e **bloqueando features premium** conforme o plano.

- **Planos vigentes (referência da §1.4 / F6.2):** `SOLO` (fee 3,49%), `CLINICA` (2,49%), `PRO` (1,99%).
  Consolidar os atributos de cada plano num único mapa de configuração no front (ex.:
  `lib/plans/plan-config.ts`): `planCode`, preço de assinatura, fee (bps), limites (ex.: nº de
  agendamentos/mês, nº de membros, nº de tipos de consulta) e flags de features premium.
- **DTO de billing:** definir/estabilizar `TeamBillingDto` (plano atual, status da assinatura, período,
  `usage` vs `limits`) consumido de `GET /teams/{teamId}/billing`. Enquanto o backend não finaliza, seguir
  o padrão mock-com-fallback + selo "Dados de demonstração".
- **Exibir limites e uso:** componente de "uso do plano" (ex.: `X de Y agendamentos usados`, barra de
  progresso Teal, aviso ao aproximar do teto) no hub da clínica e/ou no financeiro. Nunca somar/derivar
  limites no front além do que o backend informar.
- **Valores de assinatura corretos:** telas de plano/upgrade exibindo o preço certo por `planCode`
  (formatado com `formatBRLCents`) e o comparativo de fee ("plano maior, fee menor").
- **Gating de features premium:** padrão único de bloqueio (ex.: `<PremiumGate feature="...">`) que, para
  quem não tem o plano, mostra estado bloqueado + CTA de upgrade — **defesa em profundidade**: o backend
  ainda valida cada request (403 → tela/ível amigável). Nunca esconder só visualmente sem o backend
  garantir.
- **Aceite:** todo limite/valor exibido vem do plano real (ou mock com selo); features premium ficam
  visivelmente bloqueadas com CTA de upgrade para planos inferiores; nenhum preço/limite hardcoded fora do
  mapa de planos; o backend permanece a fonte da verdade (front não libera recurso sozinho).

### 8.2 Free Trial de 30 dias para novas contas/clínicas
**Meta:** toda nova conta/clínica começa com **30 dias de teste grátis** com acesso às features premium,
e a UI comunica claramente o trial e sua expiração.

- **Estado de trial:** o `TeamBillingDto` deve expor algo como `trialEndsAt` / `isTrialing` /
  `daysRemaining`. O gating de 8.1 trata `isTrialing` como "tem acesso premium" até expirar (mesmo
  `PremiumGate`, uma única checagem `hasPremiumAccess = isPaidPlan || isTrialing`).
- **UI do trial:** badge/strip persistente ("Teste grátis — N dias restantes"), tom acolhedor; ao se
  aproximar do fim (ex.: ≤7 dias), CTA de escolher plano; ao expirar, downgrade visual para `SOLO`/plano
  base + bloqueio das premium (reusando o `PremiumGate` de 8.1) e CTA claro de assinatura.
- **Onboarding — hook já pronto (F7.2):** o empty state **"Crie sua clínica"** (`team/page.tsx`) já
  menciona os **30 dias grátis**. Ao codar a F8, ligar essa comunicação ao estado real de trial e
  reforçar a mensagem no fluxo de criação (`TeamForm`).
- **Gaps de backend (a abrir em `docs/backend-backlog.md`):** provisionar `trialEndsAt` na criação da
  clínica; expor o estado de trial no billing; regra de expiração/downgrade server-side (o front só
  reflete). **Nada disso é liberado apenas no front.**
- **Aceite:** nova clínica entra em trial de 30 dias com premium liberado; a UI mostra dias restantes e
  reage à expiração (downgrade + gating + CTA); a expiração real é enforçada pelo backend.

> ⚠️ **Escopo:** a camada de frontend da Fase 8 (8.1 + 8.2) **está entregue** em mock-com-fallback
> (§2.4); a lógica real de plano/limite/trial só passa a valer quando o backend fechar os gaps de
> billing/trial (§4 · "BLOQUEIA FASE 8"). Nada é liberado apenas no front — o backend é a fonte da
> verdade e enforça a expiração do trial e o gating premium (403).

---

## 8.5. 🎨 Fase 8.5 — Health System Visual & Brand Revamp (✅ CONCLUÍDA)

> **Status (2026-07-28): CONCLUÍDA.** Legado Violet/Zinc **erradicado** — busca global por `violet` e
> `fuchsia` em `app/`/`components/`/`lib/` retorna **zero** (e `zinc` também). `tsc`, `npm run lint` e
> `npm run build` limpos. Decisão registrada no **ADR-0006 (Design System Healthtech)**.
>
> **O que foi entregue:**
> - **Landing (§8.5.2):** hero, preview, features, CTA e fundo migrados para Teal/azul clínico; copy
>   reposicionada para clínicas/consultórios; nova seção de confiança (LGPD, split transparente,
>   "feito para clínicas"); harmonizada com a `PricingSection`.
> - **Erradicação do legado (§8.5.1):** mapas `VIOLET/FUCHSIA` removidos (dashboard/bookings +
>   `EventTypeColor` no `types.ts`/validador/pickers → paleta de acento curada sem violet/fuchsia);
>   `dev-nav`, placeholders `#7c3aed` e onboarding (`step-profile`/`step-availability`) migrados.
> - **Tech-debt de UI (§8.5.3):** `TeamForm`, `/dashboard/teams` (lista + `team-members-list`),
>   `checkout-button`, `qr-card` e o fluxo público de agendamento (`booking/[uid]`, antes `#09090b`)
>   migrados para superfície clara Teal.
> - **Padronização do DS (§8.5.4):** botões → `components/ui/button.tsx`; inputs/labels →
>   `Input`/`Label`; modais complexos → `Dialog` do Radix, confirmações → `MotionModal`; skeletons
>   consolidados e `loading.tsx` completados (incl. `team/plans`, `settings/profile`,
>   `settings/availability`).
>
> As subseções abaixo permanecem como **registro do escopo planejado** (todas atendidas).

**Motivação:** com as features de negócio no lugar (F0–F8), a plataforma ainda **não tinha a "cara"
de um Health System** (software clínico). A convivência do **legado Violet/Zinc** (landing,
`TeamForm`, telas `/dashboard/teams/*`) com o novo **Teal Healthtech** (dashboard F5–F8) quebrava a
imersão e a confiança visual. Esta fase foi **puramente visual/estrutural** — **sem novas features de
negócio** — e transformou o produto num sistema **"clinicamente limpo"**: Teal primário, fundos
claros, alto contraste e espaçamento consistente. É a contrapartida da F7 (que cuidou de estados/copy)
no eixo de **marca e Design System**.

**Pré-requisito:** nenhum do backend. Dependeu apenas de consolidar os tokens/DS do front (§2.6) como
**fonte única** e varrer o legado. Decisão registrada no **ADR-0006 (Design System Healthtech)**,
fixando paleta, primitivas de UI, densidade e regras de acessibilidade.

### 8.5.1 Erradicação do tema legado (Violet/Zinc)
**Meta:** remover **toda** ocorrência de cores fora do DS (violet/fuchsia/zinc cru, hex soltos,
gradientes violeta) em favor dos utilitários de marca (§2.6: `brand-primary` Teal, `brand-secondary`
azul, `care`, `warning`, `destructive`, `surface`, `muted-foreground`, `border`).

- **Auditoria grep-ável:** varrer `violet-`, `fuchsia-`, `zinc-`, `#7c3aed` e classes equivalentes;
  substituir por tokens do tema. Meta: **zero** classes off-palette no `app/` e `components/`.
- **Superfícies-alvo conhecidas:** `app/page.tsx` (hero/preview/CTA/badges em violet→Teal),
  `app/(dashboard)/dashboard/teams/**` (lista e detalhe legados em violet/zinc), `TeamForm`
  (modal zinc-950), `checkout-button.tsx` (violet/zinc), qualquer `bg-*-50/`/`text-*-400` legado.
- **Modo escuro:** garantir a segunda paleta `.dark` consistente nas superfícies migradas.
- **Aceite:** busca por `violet|fuchsia|zinc` não retorna cor de UI em `app/`/`components/` (exceto,
  se houver, tokens neutros equivalentes já mapeados no tema); tudo passa por CSS vars do DS.

### 8.5.2 Refatoração visual da Landing Page (autoridade no nicho de clínicas)
**Meta:** a home comunicar **autoridade em saúde**, não "mais um agendador genérico".

- Reescrever hero, preview, features e CTA na **paleta Teal/azul clínica**; copy voltada a
  clínicas/consultórios e profissionais de saúde (tom da §5, sem jargão, sem prometer diagnóstico).
- Harmonizar a **`PricingSection`** (já Teal, §8.1) com o restante — hoje ela é a única seção no
  padrão novo; a landing inteira deve encostar nela, não o contrário.
- Elementos de confiança healthtech: LGPD, segurança, split transparente, "feito para clínicas".
- **Aceite:** landing 100% no DS Teal, coerente com o dashboard; nenhuma superfície violet/fuchsia;
  responsiva (§7.3) e AA (§7.4).

### 8.5.3 Pagamento dos tech-debts de UI (§6)
**Meta:** encerrar os débitos visuais que sobreviveram às fases anteriores.

- **`TeamForm`** → migrar do modal zinc-950/violet para o padrão Teal + **RHF já existente**,
  alinhando espaçamento, inputs e foco AA (é a exceção citada em §2.8/§6). Preservar o **banner de
  trial** (F8.2) já inserido.
- **`/dashboard/teams` e `/dashboard/teams/[id]`** (lista/detalhe legados) e
  `team-members-list.tsx` (paleta zinc/violet, `useState` cru no convite) → migrar para os
  componentes Teal de `components/team/` (RHF+Zod) e decidir se a lista some ou vira seletor de
  clínicas (mesma decisão pendente da F6).
- **`checkout-button.tsx`** → repadronizar no `Button` do DS.
- **Aceite:** os itens de UI da §6 saem do tech-debt; nenhuma tela do dashboard mistura paletas.

### 8.5.4 Padronização do Design System (botões, inputs, modais, skeletons)
**Meta:** um kit consistente, reutilizável e acessível — fim das variações ad-hoc.

- **Botões:** convergir tudo para `components/ui/button.tsx` (variantes/tamanhos), aposentando
  `<button>` cru estilizado à mão nas telas migradas.
- **Inputs/labels/erros:** primitiva única (base para RHF+Zod), com estados de foco/erro AA
  padronizados (substitui o `inputClass` local do `TeamForm`).
- **Modais:** primitiva de modal única (reusar/estender `MotionModal` de §2.7) para overlay,
  foco-trap, `Esc`/click-fora e `aria-*` — eliminando modais desenhados à mão.
- **Skeletons:** consolidar sobre as primitivas da F7.1 (`components/ui/skeletons/`) e **completar a
  pendência da F7.1** (replicar `loading.tsx` nas rotas restantes: `dashboard`, `bookings`,
  `event-types`, `recebimentos`, `team/financeiro`, `team/plans`).
- **Tokens de espaçamento/raio/sombra:** padronizar (ex.: cards `rounded-2xl`, `border-border/60`,
  `shadow-sm`) para densidade "clínica" consistente.
- **Aceite:** botões/inputs/modais/skeletons vêm de primitivas únicas do DS; nenhuma variação
  ad-hoc nas telas migradas; contraste AA e foco visível em todos os controles.

> ⚠️ **Escopo:** F8.5 **não** adiciona features de negócio nem toca em contratos de API — é revamp
> visual + DS + tech-debt de UI. Pode rodar em paralelo à integração real da F8 (que depende do
> backend). Recomendado registrar as decisões de marca no **ADR-0006**.

---

## 9. 🎯 Fase 9 — i18n & Testes Automatizados (PRÓXIMO FOCO)

Origem em 7.6/7.7 (movidas para manter a §7 fiel ao entregue). **Não bloqueia a F8**; 9.1 e 9.2 são
**independentes entre si** e podem rodar em paralelo/qualquer ordem. Nenhuma implementação começou.
Meta: **qualidade e escala** — internacionalizar a base de strings e blindar o front com testes
automáticos que rodem na CI a cada PR.

### 9.0 ⚠️ Contexto de monorepo (leia primeiro)

O repositório foi reorganizado num **monorepo simétrico** (ADR de infra / commit de reestruturação):

```
marcaAi/
├── frontend/   ← TODO o Next.js (package.json, configs, app/, components/, lib/, tests/) — trabalhe AQUI
├── backend/    ← API .NET 10 (Clean Architecture) — fonte da verdade; não muda nesta fase
└── docs/       ← specs + ADRs (este arquivo)
```

**Todos os caminhos citados neste documento (`app/…`, `lib/…`, `components/…`, `tests/…`,
`messages/…`) são relativos a `frontend/`.** Rode `npm`/`npx` de dentro de `frontend/`. A CI
(`.github/workflows/ci.yml`) já usa `defaults.run.working-directory: frontend` e executa
`npm ci → lint → test → build` a cada push/PR na `main`.

### 9.1 i18n — internacionalização (ADR-0005)

**Objetivo:** eliminar strings de UI hardcoded, centralizando-as num catálogo, com **pt-BR como único
locale hoje**, mas com a infraestrutura pronta para adicionar novos idiomas sem refatorar telas.

- **Ferramenta:** `next-intl` (compatível com App Router / RSC). Como só há **um locale**, usar a
  configuração **sem prefixo de rota** (sem `/pt-BR/...` na URL) — `NextIntlClientProvider` no root
  layout + `getRequestConfig`. Não introduzir `[locale]` no roteamento agora (evita mexer em todas as
  rotas); deixar documentado como o locale routing entra quando houver um 2º idioma.
- **Catálogo:** criar `messages/pt-BR.json`, organizado por **namespaces** (ex.: `common`, `nav`,
  `landing`, `dashboard`, `booking`, `team`, `billing`, `errors`). Chaves semânticas
  (`booking.confirm.title`), nunca a string como chave.
- **Consumo:** RSC → `getTranslations(ns)`; client components → `useTranslations(ns)`. Interpolação e
  plurais via ICU MessageFormat do `next-intl` (ex.: contagem de dias de trial, nº de agendamentos).
- **Datas/moeda:** padronizar via `Intl` com **locale + timezone explícitos**. Reusar
  `formatBRLCents` (`lib/utils.ts`); centralizar formatação de datas num helper único
  (`lib/i18n/format.ts`) em vez dos pontos isolados atuais com `date-fns`/`date-fns-tz`.
- **Guarda anti-regressão (opcional, recomendado):** habilitar `eslint-plugin-formatjs` ou uma regra
  simples que sinalize literais de texto em JSX fora de `messages/`.
- **Fora de escopo:** traduzir de fato para outro idioma; copy nova de produto (strings existentes só
  mudam de lugar, não de conteúdo).
- **Aceite:**
  1. `next-intl` instalado e provider ativo no root layout; `messages/pt-BR.json` é a **única** fonte
     de strings de UI.
  2. Nenhuma string de UI hardcoded fora de `messages/` nas telas migradas (landing, dashboard,
     booking, team, billing, onboarding, auth) — verificável por varredura.
  3. Datas e moeda saem de um helper central com locale/timezone explícitos.
  4. `npx tsc --noEmit`, `npm run lint`, `npm run build` limpos; app roda em pt-BR sem mudança visível
     para o usuário.

### 9.2 Testes automatizados (vitest + Playwright)

**Objetivo:** cobrir a lógica crítica com **testes unitários** (vitest) e os fluxos-chave com **E2E**
(Playwright), integrados à CI. Os scripts já existem no `package.json`: `test` (unit),
`test:integration`, `test:e2e`. A suíte antiga de Prisma foi removida (não recriar).

**9.2.1 Unitários (vitest) — foco em `lib/`:**
- `lib/api/*` (prioridade máxima): injeção de **CSRF** (`X-XSRF-TOKEN` ⟷ cookie), mapa
  `ApiError.kind` ↔ status HTTP (`problem-details.ts`), **refresh/retry** do BFF (401 → refresh →
  replay), montagem de URL/prefixo `/api/v1` (`config.ts`), `endpoints.ts`.
- `lib/brand-theme.ts` → `safeBrandColor` (contraste AA vs branco; hex inválido → fallback Teal).
- `lib/plans/plan-config.ts` → helpers de gating (`hasPremiumAccess = isPaidPlan || isTrialing`),
  `formatFeeBps`, ordenação de planos, `planFeatureLines`.
- `lib/validators/*` (Zod) → estender o `validators.test.ts` já existente (event-type usa cores da
  **paleta nova**; nada de `VIOLET`/`FUCHSIA`).
- `lib/utils.ts` → `formatBRLCents` (pt-BR/BRL; nunca somar centavos no front).
- `hooks/usePaymentStatus` → **backoff** do polling e transições de estado.

**9.2.2 Componentes (vitest + @testing-library/react) — opcional, alto valor:**
- `PremiumGate` (bloqueia/branda conforme `hasPremiumAccess`), `TrialBanner` (dias restantes/expiração),
  `EmptyState`, `RoleBadge`. Focar em lógica condicional/RBAC visual, não em pixel.

**9.2.3 E2E (Playwright) — smoke dos fluxos críticos:**
- Fixture tipado **`loggedInOwner`** em `tests/e2e/fixtures.ts` já existe. ⚠️ o 2º parâmetro chama-se
  **`provide`** (não `use`), por `react-hooks/rules-of-hooks` — **manter esse nome**.
- Fluxos: (a) landing → login (magic link, mockado); (b) dashboard renderiza para usuário onboarded;
  (c) criar **tipo de consulta** (modal Dialog → salvar); (d) **agendamento público**
  `/[username]/[slug]` → confirmação; (e) **pagamento** (PIX/Stripe em modo mock) → polling de status.
- Rodar contra a API real quando disponível; onde o backend não estiver pronto, usar o
  **mock-com-fallback** (§2.4) já embutido nas telas.

**9.2.4 Integração com a CI:**
- `npm run test` (unit) já roda no `ci.yml` a cada PR — manter verde é **bloqueante de merge**.
- Adicionar um **job/step de E2E** (`npm run test:e2e`) — pode ser um job separado (Playwright instala
  browsers) e/ou `workflow_dispatch` para não onerar todo PR. Documentar a decisão aqui ao implementar.
- Definir um **limiar de cobertura** para `lib/` (ex.: linhas ≥ 70%) via `npm run test:coverage`.

- **Aceite:**
  1. Suíte **unit verde** cobrindo `lib/api/*`, `lib/brand-theme.ts`, `lib/plans/*`, `lib/validators/*`
     e `usePaymentStatus`; cobertura de `lib/` ≥ limiar definido.
  2. **Smoke E2E** verde dos fluxos de agendamento e pagamento (com mock quando o backend faltar).
  3. CI roda os unit tests em todo PR (já configurado) e falha o merge se quebrarem; E2E rodando ao
     menos sob demanda.
  4. Zero resquício da suíte legada de Prisma; nenhum mock usando cor fora da paleta.

> **Sequência sugerida:** 9.2.1 (unit de `lib/`, retorno rápido e blinda a CI) → 9.1 (i18n, refactor
> transversal de strings) → 9.2.3 (E2E, depende das telas estáveis). 9.1 e 9.2 não têm dependência
> mútua; se houver duas frentes, tocar em paralelo.

---

## 10. Checklist para retomar num chat novo

0. **Monorepo (§9.0):** o front vive em **`frontend/`** (`/frontend`, `/backend`, `/docs`). Rode
   `npm`/`npx` de dentro de `frontend/`. Todos os caminhos deste doc são relativos a `frontend/`.
1. Ler **este documento** + `docs/backend-backlog.md` (gaps) + `docs/adrs/` (decisões).
2. Confirmar `frontend/.env`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (só estas 3 — ver `frontend/lib/env.ts`).
3. Foco atual = **Fase 9 — i18n + Testes** (§9). A **F7**, a **F8.5 (Design System Healthtech,
   ADR-0006)** estão **concluídas** e a **F8 está estrutural entregue** no front (mock-com-fallback);
   a **integração real da F8** depende dos gaps de billing/trial (§4 · "BLOQUEIA FASE 8") e pode rodar
   em paralelo. Ao mexer em UI, tratar o DS (§2.6) como **fonte única**: cor só via tokens (nunca
   `violet`/`fuchsia`/`zinc`/hex cru) e componentes só via primitivas (Button/Input/Dialog/
   MotionModal/skeletons) — ver ADR-0006.
4. Seguir os padrões da §2 (BFF/guardas, mocks-com-fallback, RBAC, brand-theme, motion, RHF+Zod, paleta
   Teal, `formatBRLCents`). Endpoints só via `endpoints.ts`. Para a F8.5, tratar o DS (§2.6) como
   **fonte única** e registrar as decisões de marca em **ADR-0006 (Design System Healthtech)**.
5. Verificar sempre: `npx tsc --noEmit`, `npm run lint`, `npm run build` (todos limpos). Atualizar este
   doc e o backlog ao final de cada fase.

**Fontes internas:** `docs/specs/frontend-healthtech-spec.md` (verdade de negócio),
`docs/specs/financial-split-spec.md`, `docs/backend-api.md` (contrato), `docs/adrs/*`,
`docs/backend-backlog.md`.
