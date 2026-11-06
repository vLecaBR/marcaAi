# Backend Backlog — dependências do Frontend (.NET)

Itens de **backend** exigidos pela construção do frontend. Mantido pelo time de frontend,
priorizado junto ao time de backend. Cada item aponta o ADR/§ da spec que o originou e a **fase de
frontend que ele bloqueia**.

> Fonte da verdade de negócio: `docs/specs/financial-split-spec.md`.
> Contrato atual da API: `docs/backend-api.md` e `frontend-healthtech-spec.md` §3.2.

---

## 🔴 BLOQUEIA FASE 5 — Endpoints de leitura financeira (`FinanceController`)

**Origem:** ADR-0003 · `frontend-healthtech-spec.md` §6.3, §10.3
**Prioridade:** Alta — o Dashboard Financeiro (Fase 5 do front) **não inicia** sem isto.
**Risco de migração:** Nenhum. O snapshot financeiro do `Booking` já é imutável após `PAID`
(garantido nas Fases 2–4). Isto é **pura camada de leitura/projeção** — sem migração destrutiva
(alinhado à §12 da spec financeira).

### Contexto

Hoje existe `GET /api/v1/bookings` (lista operacional do profissional) com `PaymentStatus`, mas
**sem os campos financeiros do snapshot** no DTO de lista, e **sem endpoints de sumário/extrato**.

Decisão (ADR-0003): **não** estender `BookingListItemDto`. Criar um **`FinanceController`** com um
`IFinanceReportService` dedicado (projeções de leitura), mantendo lista operacional e relatório
financeiro como responsabilidades separadas e evitando vazar dados financeiros em telas que não
precisam deles (§8).

### Endpoints a implementar

| Método + Rota | Uso no front | Auth/Policy |
|---|---|---|
| `GET /api/v1/finance/summary?from&to` | Cards do profissional: líquido recebido, a receber, taxas pagas, nº consultas pagas (§6.1) | 🔒 `Onboarded` (escopo = usuário do token) |
| `GET /api/v1/finance/statement?from&to&status&provider` | Extrato líquido por consulta (§6.1) | 🔒 `Onboarded` |
| `GET /api/v1/finance/teams/{teamId}/summary` | Consolidado da clínica: líquido total, por profissional, taxas, ticket médio (§6.2) | 🔒 `TeamOwner`/`TeamManager` |

### Campos do snapshot a expor nos DTOs de resposta

Todos já existem no `Booking` (Fases 2–4), basta projetar:

`PriceCents` (bruto), `PlatformFeeCents` (taxa MarcaAí), `GatewayFeeCents`, `NetToProviderCents`
(líquido), `PaymentProvider` (PIX/Cartão), `PaidAt`, `RefundedAt`, `PaymentStatus`.

### Contrato de resposta sugerido (a alinhar)

```jsonc
// GET /finance/summary?from&to
{
  "from": "2026-07-01", "to": "2026-07-31", "currency": "BRL",
  "netReceivedCents": 0,       // Σ NetToProviderCents de bookings PAID
  "pendingCents": 0,           // Σ estimado de bookings PENDING
  "platformFeesCents": 0,      // Σ PlatformFeeCents
  "paidBookingsCount": 0
}

// GET /finance/statement?from&to&status&provider  → linha por consulta
{
  "items": [{
    "bookingUid": "…", "date": "2026-07-10T14:00:00Z", "guestName": "…",
    "eventTypeTitle": "…", "grossCents": 0, "platformFeeCents": 0,
    "netToProviderCents": 0, "provider": "MERCADO_PAGO",
    "status": "PAID" // PENDING | PAID | PARTIALLY_REFUNDED | REFUNDED | FAILED
  }],
  "page": 1, "pageSize": 50, "total": 0
}

// GET /finance/teams/{teamId}/summary
{
  "teamId": "…", "currency": "BRL",
  "netTotalCents": 0, "platformFeesCents": 0, "avgTicketCents": 0,
  "byProfessional": [{ "userId": "…", "name": "…", "netCents": 0, "paidBookingsCount": 0 }],
  "plan": { "planCode": "CLINICA", "quantity": 5, "defaultFeeBps": 249 } // §6.2
}
```

### Critérios de aceite

- Somas/agregações calculadas **no servidor** (o front não soma centavos).
- Filtros `from`/`to`/`status`/`provider` respeitados server-side.
- Valores monetários em **centavos inteiros** (`*Cents`), moeda explícita.
- Respostas de erro em **ProblemDetails** (RFC 7807), consistente com o resto da API.

---

## 🔴 BLOQUEIA FASE 8 — Billing, Planos e Free Trial (`BillingController` + webhooks)

**Origem:** `future-phases-spec.md` §8 (8.1 Planos + 8.2 Free Trial) · ADR de billing (a criar).
**Prioridade:** Alta — a UI de planos/trial da Fase 8 (pricing, `PremiumGate`, `TrialBanner`,
`TeamUsageStats`) já está construída e **roda em demonstração** (`MOCK_TEAM_BILLING`, trial de 30
dias) com fallback gracioso. Para sair da demo, o backend precisa assumir os itens abaixo.
**Risco de migração:** Médio — novas colunas de assinatura/trial no agregado da clínica (nullable,
sem destrutiva) + tabela de eventos de billing.

### Contexto

O front trata **plano, limites, uso e trial como fonte-da-verdade do backend** (spec §2.5). O mapa
`lib/plans/plan-config.ts` (SOLO/CLINICA/PRO · fees 3,49%/2,49%/1,99%) é só para **exibição e
fallback** — o backend deve validar cada request premium (403 → tela amigável no front) e enforçar a
expiração do trial. Hoje existe apenas `POST /teams/{teamId}/billing/checkout` (retorna `{ url }`) e
um `TeamBillingDto` **mínimo** (`teamId/status/active/currentPeriodEnd`); é preciso **estabilizar o
`TeamBillingDto` estendido** e o ciclo de assinatura.

### 1) Estabilizar `GET /teams/{teamId}/billing` (contrato estendido)

O front já consome esta forma (`lib/api/billing-types.ts`). Enquanto `trial`/`planCode` não vierem,
o front mantém o mock.

```jsonc
// GET /teams/{teamId}/billing   🔒 TeamMember (uso/limite/trial) · dados sensíveis só p/ OWNER/ADMIN
{
  "teamId": "…",
  "planCode": "SOLO|CLINICA|PRO",
  "status": "TRIALING|ACTIVE|PAST_DUE|CANCELED|INACTIVE",
  "active": true,                 // conveniência: TRIALING || ACTIVE
  "currentPeriodEnd": "2026-08-26T00:00:00Z", // null se sem assinatura paga
  "trial": {
    "isTrialing": true,
    "trialEndsAt": "2026-08-26T00:00:00Z",    // null fora de trial
    "daysRemaining": 18                        // calculado no servidor; null fora de trial
  },
  "usage": {                       // sempre calculado no servidor (o front nunca soma)
    "bookingsThisMonth": 84,
    "membersCount": 5,
    "eventTypesCount": 6
  },
  "limits": {                      // limites efetivos (autoritativo); null = ilimitado
    "maxBookingsPerMonth": 100,
    "maxMembers": 5,
    "maxEventTypes": 10
  }
}
```

### 2) Provisionar o Free Trial de 30 dias na criação da clínica

- Ao criar a clínica (`POST /teams`), gravar `trialEndsAt = now + 30d` e `status = TRIALING`.
- Durante o trial, tratar como **acesso premium** (o front usa `hasPremiumAccess = isPaidPlan ||
  isTrialing`). A UI de onboarding (`TeamForm`) e a landing já **prometem** os 30 dias.

### 3) Rotina de expiração / rebaixamento (downgrade) server-side

- Job/agendado (ou verificação on-read) que, ao passar `trialEndsAt` sem assinatura paga, rebaixa a
  clínica para o **plano base `SOLO`** e passa `status` para `INACTIVE`/`CANCELED`.
- A partir daí, as features premium retornam **403** (o front já reage com `PremiumGate` + CTA).

### 4) Checkout por plano + Customer Portal

- Estender `POST /teams/{teamId}/billing/checkout` para aceptar **`{ planCode }`** (upgrade/downgrade
  a partir da pricing table do dashboard). Hoje a action do front chama sem `planCode`.
- Expor portal do cliente (gerenciar/cancelar) — pode ser o mesmo endpoint retornando a URL do portal
  quando já assinante.
- Regras: apenas `OWNER` inicia/gerencia assinatura (403 caso contrário).

```jsonc
// POST /teams/{teamId}/billing/checkout   🔒 TeamOwner
// body: { "planCode": "CLINICA" }   → { "url": "https://checkout.stripe.com/…" }
```

### 5) Webhooks do provedor (Stripe/Mercado Pago) — fonte da verdade da assinatura

- Endpoint de webhook (assinatura verificada) para sincronizar `status`, `planCode`,
  `currentPeriodEnd` a partir de eventos do provedor:
  `checkout.session.completed`, `customer.subscription.updated|deleted`,
  `invoice.paid|payment_failed` (→ `PAST_DUE`).
- Idempotência por `event.id`; refletir mudanças no `TeamBillingDto` lido pelo front.

### Enforcement premium (defesa em profundidade)

Espelhar o gating do front no backend (o front nunca libera sozinho): cada rota/feature premium
(ex.: financeiro consolidado da clínica `GET /finance/teams/{teamId}/summary`, lembretes WhatsApp,
branding, relatórios avançados) valida `hasPremiumAccess` server-side → **403** quando expirado.

### Critérios de aceite

- `GET /teams/{teamId}/billing` responde o contrato estendido (plano/uso/limites/trial), em
  ProblemDetails nos erros.
- Nova clínica entra em trial de 30 dias; expiração rebaixa para SOLO e bloqueia premium (403).
- Checkout aceita `planCode`; webhooks mantêm o estado sincronizado e idempotente.
- Limites/uso calculados no servidor; valores monetários em centavos.

---

## 🟠 Fase 6 — Gestão de equipe da clínica (RBAC)

### Alterar papel de um membro

**Origem:** Fase 6 do front (Visão da Clínica · `/dashboard/team`) · `future-phases-spec.md` §3 (Clínicas).
**Prioridade:** Média — a UI já expõe o seletor de papel (OWNER/ADMIN gerenciam), gated no cliente;
falta o endpoint para persistir. Enquanto ausente, a troca de papel funciona só em demonstração.

| Método + Rota | Uso no front | Auth/Policy |
|---|---|---|
| `PUT /api/v1/teams/{id}/members/{userId}` | Trocar o papel de um membro (`MEMBER` ⇄ `ADMIN`) | 🔒 `TeamOwner`/`TeamManager` |

Contrato sugerido:

```jsonc
// PUT /teams/{id}/members/{userId}
// body:
{ "role": "ADMIN" } // ADMIN | MEMBER  (transferência de OWNER é fluxo à parte, fora deste endpoint)
// 200 → membro atualizado; 403 sem permissão; 404 membro inexistente; 409 tentativa de rebaixar o OWNER
```

Regras de negócio (espelhar no backend, já refletidas no RBAC do front):
- Apenas `OWNER`/`ADMIN` podem alterar papéis.
- Não é possível alterar o papel do `OWNER` por aqui, nem o usuário alterar o próprio papel.
- Promover a `OWNER` (transferência de propriedade) é um fluxo dedicado separado (v2).

---

## 🟡 Confirmar / documentar — contrato já existente

Itens que o front presume; validar que o contrato está estável antes das Fases 3–4.

- **`POST /api/v1/bookings/{uid}/pay`** (§3.3): retorno `clientSecret` (Stripe) ou
  `pixQrCode`/`pixQrCodeBase64`/`pixTicketUrl` (Mercado Pago) + `providerPaymentId`, `amountCents`,
  `applicationFeeCents`. — _Bloqueia Fase 3._
- **`GET /api/v1/bookings/{uid}`** deve refletir `PaymentStatus` atualizado por webhook, para o
  polling do ADR-0002 funcionar. — _Bloqueia Fase 3._
- **Payout onboarding** (`/api/v1/payouts/*`, §3.2): status `PENDING/ACTIVE/RESTRICTED` legível pelo
  front para o badge de recebimentos. — _Bloqueia Fase 4._

---

## 🟠 Fase 1 — Perfil clínico + contrato de redirect de auth

### Estender `UpdateProfileInput` com campos de saúde

**Origem:** spec §3 (dados médicos) · `lib/validators/health-profile.ts`
**Prioridade:** Média — o onboarding **já coleta e envia** estes campos (forward-compatible), mas a
API hoje só persiste `name/username/timeZone/bio`. Os demais são ignorados até o DTO crescer.

Adicionar a `UpdateProfileInput` (e à projeção de `MeDto`/perfil) os campos:

| Campo | Tipo | Observação |
|---|---|---|
| `specialty` | string | Especialidade (ex.: "Psicologia clínica") |
| `council` | enum string | CRM/CRP/CRO/CREFITO/CRN/CREFONO/COREN/CRMV/OUTRO |
| `registrationNumber` | string | Nº de registro no conselho |
| `clinicName` | string? | Clínica/consultório (opcional) |

Sem migração destrutiva: colunas novas nullable. Enquanto não existir, o front envia os campos e
o backend os descarta silenciosamente (ASP.NET ignora chaves desconhecidas no bind).

### Contrato de redirect do front (OAuth Google)

**Origem:** `app/auth/callback/route.ts` · spec §3.2
Após `GET /auth/google/complete` emitir a sessão, a API deve **redirecionar (302) para
`{FRONT_URL}/auth/callback`**. O front então consulta `getMe()` e roteia para `/onboarding` ou
`/dashboard`. Expor `FRONT_URL` como configuração no backend.

O magic link já é tratado sob controle do front: o e-mail deve apontar para
`{FRONT_URL}/auth/verify?token=...` (não para a rota da API). Confirmar/ajustar o template de e-mail
no backend para usar essa URL.

---

## 🟠 Fase 5 — Gaps descobertos na migração do dashboard

Itens que o dashboard já consome, mas cujo contrato de API está incompleto. Cada um degrada uma UI
existente até ser resolvido.

- **Aprovação/confirmação manual de booking** — não há endpoint para confirmar um `PENDING`
  (o fluxo antigo criava o evento no Google e marcava `CONFIRMED`). `approveBookingAction` está
  desabilitada (retorna aviso). _Sugestão:_ `POST /bookings/{uid}/confirm` 🔒 (dono).
  Bloqueia a aprovação na tela de agendamentos.
- **Detalhe de EventType com campos avançados** — `GET /event-types` só retorna o resumo
  (sem `beforeEventBuffer`/`afterEventBuffer`/`bookingLimitDays`/`locationValue`/`questions`).
  A edição desses campos no formulário fica com defaults. _Sugestão:_ `GET /event-types/{id}`
  com o objeto completo; e suporte a `questions` no `EventTypeInput`.
- **Perfil autenticado completo** — não há `GET /me` com `name/bio/brandColor/theme`. O front
  pré-preenche o perfil via `GET /public/{username}`, o que só funciona após o onboarding.
  _Sugestão:_ `GET /me/profile` 🔒 devolvendo o perfil editável.
- **`GET /schedules` deve garantir agenda padrão** — o front assume que a agenda padrão existe
  (o fluxo Prisma antigo criava on-demand). Confirmar que a API provisiona/《auto-cria》a agenda
  padrão no primeiro acesso; senão, expor `POST /schedules`.

---

## 🟡 Fase 3 — Pagamento (checkout do paciente)

- **`POST /bookings/{uid}/pay`** deve retornar, por provedor (spec §3.3): Cartão →
  `clientSecret`; PIX → `pixQrCode` + `pixQrCodeBase64` + `pixTicketUrl`; comum →
  `providerPaymentId`, `amountCents`, `applicationFeeCents`. Erros: `409` já paga/conta inativa,
  `422` sem preço, `502` falha no provedor.
- **`GET /bookings/{uid}`** deve refletir `paymentStatus` atualizado por webhook (base do polling).
- **Config front:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Elements) e `NEXT_PUBLIC_APP_URL`
  (return_url do Stripe). Libs `@stripe/stripe-js` e `@stripe/react-stripe-js` já em `package.json`.

---

## 🔴 Fase 2 — Gaps do agendamento público

Bloqueiam o fluxo público ponta a ponta.

- **`GET /public/{username}` deve expor o id do profissional (`ownerId`)** — o front precisa dele
  para chamar `GET /slots?ownerId=...` e `POST /bookings`. Hoje o contrato lista
  `username, name, bio, image, brandColor, theme, timeZone, eventTypes[]`, sem id. _Alternativa:_
  aceitar `username` em `/slots` e `/bookings`. **Bloqueia slots + criação de booking.**
- **`POST /bookings` deve aceitar `responses` (respostas de perguntas) e `recurringCount`** — o
  formulário coleta, mas a API ainda não recebe (enviamos sem esses campos por ora).
- **Endpoint público de clínica** — `GET /public/team/{slug}` (perfil + profissionais) para as
  páginas `/team/[slug]`. Sem ele, essas páginas mostram um placeholder "em breve" e
  `/team/[slug]/[username]` redireciona para o perfil individual.
- **`GET /public/{username}` — expor por serviço:** `requiresConfirm`, `bookingLimitDays` e
  buffers, hoje assumidos com defaults na página de agendamento.

---

## 🟢 Futuro (v2) — Rateio interno da clínica

**Origem:** `frontend-healthtech-spec.md` §6.2 · `financial-split-spec.md` §12.1 (`RevenueShareRule`).
Endpoint de leitura da "fatia de cada profissional" quando a clínica definir os percentuais. O front
(Fase 6) apenas **prevê o espaço** (coluna "sua fatia") sem cálculo. Sugestão: expor sob o mesmo
`FinanceController` quando priorizado. **Sem bloqueio de fase agora.**

---

## Convenções para novos itens

Ao adicionar um item, informe: origem (ADR/§ da spec), fase de front bloqueada, se há risco de
migração, e o contrato de resposta esperado (mesmo que rascunho, para alinhar cedo).
