# recovery-spec.md — MarcaAí · Correção de 3 bugs críticos de billing

**Status:** Spec de recuperação para nova sessão · **Escopo:** Frontend (Next.js/Vercel) + Backend (.NET/Render) + Stripe
**Como usar:** cole este documento como contexto inicial num novo chat. Ele descreve a arquitetura atual e o que corrigir.

---

## 1. Contexto Arquitetural

### 1.1 Stack e deploy
- **Frontend:** Next.js (App Router, RSC + Server Actions) na **Vercel**. Cliente puro da API .NET (sem banco/OAuth próprios). Base da API em `NEXT_PUBLIC_API_URL`; o front prefixa `/api/v1`.
- **Backend:** .NET 10 (EF Core 10 + Npgsql/Postgres) no **Render**. Controllers com attribute routing sob `/api/v1`. Auth por JWT (magic link + Google OAuth); **não há NextAuth**.
- **Billing:** **Stripe** — Billing (assinaturas) + **Connect Express** (recebimentos/split). Mercado Pago é esqueleto (PIX, fora de escopo aqui).

### 1.2 Planos (4) e cobrança SEPARADA
Fonte da verdade da taxa: `PlanCatalog` (backend, `MarcaAi.Application/Features/Billing/PlanCatalog.cs`) espelhando `frontend/lib/plans/plan-config.ts`.

| Código | Trilha | Preço/mês | Taxa (feeBps) | Cobrança |
|---|---|---|---|---|
| `SOLO` | individual (free) | R$ 0 | 10% (1000) | — |
| `SOLO_PRO` | individual | R$ 49 | 5% (500) | **UserSubscription** (1:1) |
| `CLINICA` | clínica | R$ 129 | 2,49% (249) | **Subscription** (Team) |
| `CLINICA_PRO` | clínica | R$ 199 | 1,99% (199) | **Subscription** (Team) |

- **Individual (Solo/Solo Pro):** entidade `UserSubscription` (tabela `user_subscriptions`, FK `userId` único). Serviço `UserBillingService` / `IUserBillingService`. Controller `UserBillingController` → `GET /api/v1/user/billing`, `POST /api/v1/user/billing/checkout {planCode}`. Checkout do Stripe com `metadata.userId`.
- **Clínica (Clínica/Clínica Pro):** entidade `Subscription` (por `teamId`). Serviço `StripeBillingService` / `IBillingService`. Controller `BillingController` → `GET /api/v1/teams/{teamId}/billing`, `POST /api/v1/teams/{teamId}/billing/checkout`. Checkout com `metadata.teamId`. Split de clínica é mais complexo (recebedor = Team).
- **Webhook único** `POST /api/v1/webhooks/stripe` (secret `Stripe:WebhookSecret`) → `StripeBillingService.HandleWebhookAsync`, que **roteia por metadata**: `teamId` → upsert `Subscription`; `userId` → upsert `UserSubscription`.
- **Connect/split** `POST /api/v1/webhooks/stripe/connect` (secret `Stripe:ConnectWebhookSecret`) → `StripeConnectService` (KYC `account.updated` → `PayoutAccount.Status=ACTIVE`; `payment_intent.succeeded` → snapshot no `Booking`).

### 1.3 Plano efetivo e enforcement
- `BillingStatusMapper.Effective(status, planCode)`: só assinatura **viva** (`active`/`trialing`) concede o plano pago; senão cai para **SOLO**. Logo, clínica sem assinatura ativa resolve para SOLO (individual) — **isto oculta o menu Clínica** (ver §1.5).
- `IPlanAccessService`/`PlanAccessService`: resolve plano efetivo e responde `HasFeature`. Enforcement: `custom_branding` (403 em `PUT /teams/{id}` ao mudar `BrandColor`) e `whatsapp_reminders` (gate no `ReminderJob`).
- Fee de split (`BookingPaymentService.ResolveFeePercentBpsAsync`): override da sub-conta → TEAM via `Subscription` → USER via `UserSubscription` ativa (Solo Pro 5%) → fallback Solo 10%.

### 1.4 Recebimentos (Connect)
- Front: `app/(dashboard)/dashboard/recebimentos/page.tsx` → card `components/payouts/payout-status-card.tsx` → `startPayoutOnboardingAction("STRIPE")` (`lib/actions/payouts.ts`) → `POST /api/v1/payouts/onboarding {provider}` espera `{ onboardingUrl }` e redireciona.
- Back: `PayoutsController.StartOnboarding` → `IPayoutAccountService.StartOnboardingAsync` (cria `PayoutAccount` PENDING) → resolve `IConnectOnboardingService` por provider → `StripeConnectService.CreateOnboardingLinkAsync` (cria **Express account** BR + **Account Link** `account_onboarding`, URLs de retorno em `App:PublicUrl`) → persiste `ExternalAccountId`+`OnboardingUrl`. Se `Stripe:SecretKey` ausente **ou** o SDK lançar `StripeException`, retorna **null** → conta segue PENDING **sem** `onboardingUrl`.
- RBAC (Q6): quando `ownerType=TEAM`, exige OWNER/ADMIN (403). Para USER (Solo) não há check de team.

### 1.5 Rotas de planos e gating de clínica
- **Tela neutra:** `app/(dashboard)/dashboard/plans/page.tsx` (`PLANS_ROUTE = "/dashboard/plans"` em `components/billing/premium-gate.tsx`). Agrupa por `audience`; usuário individual vê Solo/Solo Pro; clínica vê Clínica/Clínica Pro. **Sem** `ClinicTabs`.
- **Tela antiga (contexto clínica):** `app/(dashboard)/dashboard/team/plans/page.tsx`, **dentro de `dashboard/team/**`** — protegida por `app/(dashboard)/dashboard/team/layout.tsx` que chama `requireClinicPlan()` (`lib/auth/guards.ts`): redireciona para `/dashboard` quem não está numa trilha clínica.
- Menu (sidebar/mobile) em `app/(dashboard)/layout.tsx`: item "Clínica" só aparece se `isClinicPlan(billing.planCode)`. **Não há item de menu para `/dashboard/plans`** (provável causa do bug 2).

### 1.6 Retenção de intenção (Q8, atual)
- `pricing-section.tsx`: planos pagos linkam `/login?plan=CODE`.
- `PlanIntentCapture` (client, no `/login`) grava em **localStorage** (`marcaai_pending_plan`) via `lib/billing/plan-intent.ts`.
- `CheckoutIntentRunner` (montado em `app/(dashboard)/layout.tsx`, recebe `primaryTeamId={billing.teamId}`) lê a intenção no `/dashboard` e dispara `createUserCheckoutSessionAction` (individual) ou `createCheckoutSessionAction(teamId)` (clínica), limpa e redireciona ao Stripe.
- **Fragilidade:** depende de localStorage sobreviver ao ciclo de auth. No **Google OAuth** o fluxo faz hops entre origens (Vercel ↔ Render ↔ accounts.google.com); a captura só roda em `/login`, mas o retorno do OAuth pode cair em rota diferente e/ou o `localStorage` não é acessível server-side para propagar a intenção (ver bug 1).

---

## 2. Diagnóstico dos 3 bugs

### Bug 1 — Lost Intent via Google Auth
**Sintoma:** login por Google não dispara o checkout automático no dashboard.
**Raiz provável:**
1. `PlanIntentCapture` só roda na página `/login`. No botão "Entrar com Google", a navegação sai para `accounts.google.com` **antes** de o efeito persistir, ou o usuário inicia o OAuth de outra rota (landing) sem passar pelo `/login?plan=`.
2. O retorno do OAuth passa pelo **backend (Render)** (`/auth/google/complete`) e só então redireciona ao **frontend (Vercel)**. `localStorage` é **por origem** e **inacessível server-side**, então a intenção não é propagada pelo `state` do OAuth — depende puramente de o mesmo `localStorage` do browser ainda existir ao voltar. Qualquer landing em rota/aba diferente, ou storage particionado, perde a intenção.
3. `CheckoutIntentRunner` roda no `/dashboard`, mas se o retorno do OAuth cair em outra rota intermediária (ex.: `/auth/callback`) sem repassar, ou se o runner montar antes do storage, não dispara.

**Conclusão:** localStorage é frágil para um fluxo OAuth multi-origem. A intenção precisa viajar **dentro do fluxo de auth** (cookie same-site + `state`/redirect param), não só no storage do cliente.

### Bug 2 — Tela de gerenciamento de planos inacessível
**Sintoma:** usuário não encontra onde ver/trocar de plano.
**Raiz provável:**
1. A rota neutra `/dashboard/plans` **existe** mas **não tem item de menu** (a sidebar só linka "Clínica" condicionalmente). O usuário não tem entrada de navegação.
2. Links legados/CTA podem apontar para `/dashboard/team/plans`, que agora está **atrás do guard `requireClinicPlan`** (`team/layout.tsx`): um usuário individual (ou clínica sem assinatura ativa, que resolve para SOLO) é **redirecionado para `/dashboard`**, dando a impressão de "sumiu".
3. Efeito colateral do plano efetivo (§1.3): clínica com assinatura inativa vira SOLO → perde acesso a `dashboard/team/**` inteiro, inclusive a tela de planos antiga.

**Conclusão:** a tela existe (`/dashboard/plans`) mas está **órfã de navegação**, e a antiga está gated. Falta um ponto de entrada sempre acessível.

### Bug 3 — Crash na ativação do Stripe Connect
**Sintoma:** front mostra "Não foi possível iniciar o cadastro de recebimentos. Tente novamente."
**Raiz provável:** `startPayoutOnboardingAction` só falha assim quando o backend **não retorna `onboardingUrl`**. Isso ocorre quando `StripeConnectService.CreateOnboardingLinkAsync` retorna **null**, por:
1. `Stripe:SecretKey` **ausente/errada** no Render → método retorna null com log de aviso.
2. **Connect não habilitado** na conta Stripe, ou **perfil da plataforma incompleto** (Connect exige preencher o profile antes de criar Express accounts) → `AccountService.CreateAsync` lança `StripeException`, capturada e convertida em null.
3. `AccountLinkCreateOptions.ReturnUrl/RefreshUrl` inválidas (`App:PublicUrl` vazio/localhost em produção) → `StripeException`.
4. O erro real é **engolido** (só `logger.LogError`), então o front recebe genérico e não sabe a causa.

**Conclusão:** provável mistura de **config ausente** (secret/Connect/URLs) + **erro mascarado**. Precisa propagar a causa e validar a config/estado do Connect.

---

## 3. Plano de Execução (step-by-step)

> Ordem sugerida: Bug 3 (destrava recebimentos) → Bug 2 (rota de planos) → Bug 1 (intenção via OAuth).

### 3.1 Bug 3 — Stripe Connect onboarding

**Backend**
1. Em `StripeConnectService.CreateOnboardingLinkAsync`: **não** retornar null silencioso em `StripeException`. Propagar uma exceção tipada (ex.: `PayoutOnboardingException`) com a `StripeException.Message`/`StripeError.Code`. Mantê-la null **apenas** quando `Stripe:SecretKey` estiver realmente ausente (config), e nesse caso retornar um erro de config claro.
2. Em `PayoutsController.StartOnboarding`: quando `StartOnboardingAsync` não produzir `OnboardingUrl`, responder `Problem(statusCode: 502, detail: <mensagem real do Stripe>)` em vez de `Ok` com url vazia. Diferenciar 503 (config ausente) de 502 (falha do provedor).
3. Validar/instrumentar: logar `account.Id`, `ChargesEnabled`, e o `StripeError.Code` (`account_invalid`, `platform_profile_incomplete`, etc.).
4. Conferir `Stripe:Prices:*` não é necessário aqui (é billing), mas `App:PublicUrl` **precisa** ser a URL pública do front (https), senão o Account Link falha.

**Config (Render)**
5. Setar `Stripe:SecretKey` (sk_live/test), `Stripe:ConnectWebhookSecret`, `App:PublicUrl=https://<front>`. No dashboard do Stripe: **ativar Connect** e **completar o perfil da plataforma** (Connect → Settings). Sem isso, `AccountService.CreateAsync` falha.

**Frontend**
6. Em `lib/actions/payouts.ts` (`startPayoutOnboardingAction`): repassar `err.problem.detail` real para a UI (já faz parcialmente) e, no `payout-status-card.tsx`, exibir a mensagem específica em vez do genérico.
7. Teste: `POST /api/v1/payouts/onboarding {provider:"STRIPE"}` autenticado como profissional Solo deve retornar `{ onboardingUrl }` e redirecionar ao KYC.

**Critério de aceite:** clicar "Ativar recebimentos" abre o Stripe Connect; erro (se houver) mostra causa acionável (config vs provider).

### 3.2 Bug 2 — Rota de planos acessível

**Frontend**
1. Adicionar item de menu **sempre visível** para `/dashboard/plans` em `app/(dashboard)/layout.tsx` (desktop e mobile), ex.: seção "Configurações" → "Planos e assinatura" (ícone `CreditCard`). Não condicionar a `isClinicPlan`.
2. Garantir que **todos** os CTAs de upgrade usam `PLANS_ROUTE` (`/dashboard/plans`) — auditar `premium-gate.tsx`, `trial-banner.tsx` e quaisquer `Link href="/dashboard/team/plans"` remanescentes; trocar por `/dashboard/plans`.
3. Confirmar que `/dashboard/plans/page.tsx` **não** está sob nenhum guard de clínica (não está em `dashboard/team/**`) e usa `requireOnboarded()` apenas.
4. A tela neutra deve mostrar o **plano ativo** (badge "Seu plano atual") lendo `getUserBilling()`/`getTeamBilling()` — já existe; validar que reflete `planCode` efetivo.
5. (Opcional) Redirecionar `/dashboard/team/plans` → `/dashboard/plans` para eliminar a duplicidade e o efeito do guard.

**Critério de aceite:** de qualquer plano, existe um item de menu que abre `/dashboard/plans`, mostrando o plano atual e permitindo upgrade/downgrade (individual e clínica).

### 3.3 Bug 1 — Retenção de intenção resistente a OAuth

**Estratégia:** trocar **localStorage** por **cookie same-site** + propagação via **OAuth `state`/redirect**, para a intenção sobreviver ao round-trip Vercel↔Render↔Google.

**Frontend**
1. Em `PlanIntentCapture` (e/ou já no clique do plano na landing): além do storage, **gravar um cookie** `mai_plan=<CODE>` (`Path=/`, `SameSite=Lax`, `Max-Age` ~30min, `Secure` em prod). Cookie é enviado nas navegações de retorno do OAuth e é **legível server-side**.
2. No botão "Entrar com Google": propagar o plano para o início do OAuth — anexar `?plan=CODE` (ou `state`) à chamada de `endpoints.auth.googleStart`, para o backend ecoá-lo no redirect final.
3. `CheckoutIntentRunner` (dashboard): ler a intenção do **cookie** (fallback localStorage). Como o runner é client, ler cookie via `document.cookie` ou expor via um cookie **não-HttpOnly** `mai_plan`. Ao disparar, **limpar** cookie + storage.
4. Cobrir o caso "já onboarded": o runner no `/dashboard` continua sendo o ponto único de disparo.

**Backend (auth Google)**
5. Nos endpoints `auth.googleStart`/`googleComplete`/`googleExchange`: aceitar um parâmetro `plan` (ou `returnTo`) e **preservá-lo no `state`** do OAuth; no redirect final para o front, incluir `?plan=CODE` (ou setar o cookie `mai_plan` no response do `complete`). Assim a intenção é reconstruída mesmo se o localStorage do browser se perder.
6. Garantir `SameSite=Lax` e domínio correto do cookie (front). Se front e back forem domínios distintos, o cookie deve ser setado **pelo front** (rota de callback do front) ou repassado via querystring.

**Decisão recomendada:** **cookie same-site definido no clique + `plan` no `state` do OAuth**, com o dashboard lendo cookie→querystring→localStorage nessa ordem. Não confiar só em localStorage.

**Critério de aceite:** clicar plano pago → login por Google → ao chegar no `/dashboard`, checkout do Stripe dispara automaticamente; a intenção é limpa após o disparo; navegação anônima degrada para o fallback manual (`/dashboard/plans`).

---

## 4. Arquivos-chave (mapa rápido)

| Área | Frontend | Backend |
|---|---|---|
| Planos (config) | `frontend/lib/plans/plan-config.ts` | `…/Application/Features/Billing/PlanCatalog.cs` |
| Billing clínica | `…/dashboard/team/plans/page.tsx`, `lib/actions/billing.ts` | `BillingController`, `StripeBillingService` |
| Billing individual | `lib/api/billing.ts` (`getUserBilling`), `lib/actions/billing.ts` (`createUserCheckoutSessionAction`) | `UserBillingController`, `UserBillingService`, `UserSubscription` |
| Tela de planos | `…/dashboard/plans/page.tsx`, `components/billing/premium-gate.tsx` (`PLANS_ROUTE`) | — |
| Gating clínica | `app/(dashboard)/layout.tsx`, `dashboard/team/layout.tsx`, `lib/auth/guards.ts` | RBAC em `TeamsController`/`FinanceController`/`PayoutsController` |
| Recebimentos | `…/dashboard/recebimentos/page.tsx`, `components/payouts/payout-status-card.tsx`, `lib/actions/payouts.ts` | `PayoutsController`, `IPayoutAccountService`/`PayoutAccountService`, `StripeConnectService.CreateOnboardingLinkAsync` |
| Intenção (Q8) | `lib/billing/plan-intent.ts`, `components/billing/plan-intent-capture.tsx`, `components/billing/checkout-intent-runner.tsx`, `pricing-section.tsx`, `app/login/page.tsx` | endpoints `auth.google*` |
| Webhooks | — | `StripeWebhookController` (`/webhooks/stripe`, `/webhooks/stripe/connect`) |

## 5. Config esperada (backend / Render)
```
Stripe:SecretKey, Stripe:WebhookSecret, Stripe:ConnectWebhookSecret
Stripe:Prices:SoloPro, Stripe:Prices:Clinica, Stripe:Prices:ClinicaPro   (Solo é grátis, sem price)
Platform:FeeFixedCents = 0            (taxa só percentual)
App:PublicUrl = https://<frontend>    (retorno de checkout + Account Link)
```
No Stripe dashboard: **Connect habilitado + perfil da plataforma completo** (pré-requisito do bug 3).

## 6. Verificação final
- `./build.sh` (raiz) verde: backend (.NET) + frontend (Next.js).
- `dotnet ef database update` aplicado (tabela `user_subscriptions`); `backend/scripts/normalize_plan_codes.sql` rodado.
- Seguir `docs/test-checklist.md` (matriz plano × recurso + fluxo de intenção).
