# spec_q.md — Correções e melhorias do dashboard (pós-onboarding)

**Status:** Draft para revisão · **Escopo:** Frontend (Next.js) + Backend (.NET) + config de planos
**Origem:** pontos levantados ao acessar o dashboard pela primeira vez após concluir o onboarding.
**Regra:** documento de especificação. Nada de código alterado até aprovação.

> Fontes da verdade relacionadas:
> - Planos (front): `frontend/lib/plans/plan-config.ts`
> - Regras financeiras / split / preços: `docs/specs/financial-split-spec.md`
> - Gaps de backend já mapeados: `docs/backend-backlog.md`
> - Contrato de billing (front): `frontend/lib/api/billing-types.ts`, `frontend/lib/api/billing.ts`

---

## 0. Diagnóstico rápido (por que quase tudo está "meio pronto")

O dashboard foi entregue na **Fase 8** em modo **"mock-com-fallback"**: as telas, rotas e chamadas
já são as definitivas, mas quando o backend ainda não expõe o contrato real, a página cai para um
**mock** para não quebrar. Isso explica, de uma vez, quase todos os pontos abaixo:

- Recebimentos, Financeiro e Planos leem a API e, ao falhar, exibem **dados de demonstração**.
- A diferenciação de planos hoje é **UX/gating de tela** — o backend ainda não force a regra de negócio.
- A navegação da "Clínica" é **estática** (aparece para todo mundo).

As correções abaixo têm uma **ordem recomendada** porque dependem umas das outras. A reestruturação
de planos (Q1) é a base; o gating (Q2) e a tela de planos (Q3) consomem esse modelo; Recebimentos
(Q4) e Financeiro (Q5) são integrações de backend independentes; Q6 valida tudo ponta a ponta.

**Ordem sugerida:** Q1 → Q2 → Q3 → (Q4 ‖ Q5 em paralelo) → Q6.

---

## Q1. Reestruturar os planos (Solo / Solo Pro / Clínica / Clínica Pro)

### Estado atual

`frontend/lib/plans/plan-config.ts` define **3 planos** com estes valores:

| Código | Nome | Preço/mês | Taxa | Limites |
|---|---|---|---|---|
| `SOLO` | Solo | R$ 0 | 3,49% | 50 agend./mês · 1 prof. · 3 tipos |
| `CLINICA` | Clínica | R$ 49 | 2,49% | ilimitado · 10 prof. · ilimitado |
| `PRO` | Pro | R$ 99 | 1,99% | ilimitado · ilimitado · ilimitado |

⚠️ **Inconsistência pré-existente a resolver:** `docs/specs/financial-split-spec.md` (§4.3) descreve
uma tabela **diferente** (Free/Trial 4,99%, Solo **R$ 79** 3,49%, Clínica **R$ 149** 2,49% + R$ 39/prof
extra, Pro 1,99%, todas com **+ R$ 1,00 fixo** por consulta). Os dois documentos precisam convergir
para uma tabela única antes de codar.

### Objetivo (novo desenho pedido)

Passar para **4 planos**, separando a trilha **individual** da trilha **clínica**:

| Código (novo) | Nome | Perfil | Preço/mês | Taxa/consulta | Limites principais |
|---|---|---|---|---|---|
| `SOLO` | Solo | 1 profissional (grátis) | R$ 0 | **10%** | mantém os limites atuais do Solo |
| `SOLO_PRO` | Solo Pro | 1 profissional | **R$ ?? (validar)** | **5%** | agendamentos ilimitados · tipos de consulta ilimitados · lembretes no WhatsApp |
| `CLINICA` | Clínica | multiprofissional | **manter** | **manter (2,49%)** | manter |
| `CLINICA_PRO` | Clínica Pro | multiprofissional | **?? (validar)** | **?? (validar)** | renomeado do antigo `PRO`; validar coerência |

Regras que o desenho deve preservar:

1. **Escada de taxa decrescente** ("plano maior, taxa menor"): 10% → 5% → 2,49% → ~1,99%. Manter
   essa ordenação ao definir os valores de Clínica Pro.
2. **Solo/Solo Pro = 1 profissional**; **Clínica/Clínica Pro = multiprofissional**. O gating (Q2/Q3)
   depende dessa separação.
3. **Solo (grátis):** só muda a taxa para **10%**; o resto (limites de agendamento/tipos) continua
   como está hoje.
4. **Solo Pro:** 1 profissional, **agendamentos ilimitados**, **tipos de consulta ilimitados**,
   **taxa 5%**, **lembretes automáticos no WhatsApp**.

### Etapas

**Frontend — `frontend/lib/plans/plan-config.ts`**

1. Estender o type `PlanCode` para `"SOLO" | "SOLO_PRO" | "CLINICA" | "CLINICA_PRO"`.
2. Reescrever `PLAN_CONFIG` com os 4 planos, ajustando `name`, `monthlyPriceCents`, `feeBps`
   (10% = `1000`, 5% = `500`, 2,49% = `249`, etc.), `limits` e `premiumFeatures`.
3. Atualizar `PLAN_ORDER` para `["SOLO", "SOLO_PRO", "CLINICA", "CLINICA_PRO"]` e os campos `order`.
4. Marcar quais planos são **individuais** vs **clínica** (sugestão: adicionar um campo
   `audience: "individual" | "clinic"` ao `PlanConfig`, consumido por Q2/Q3 para decidir o que
   mostrar). Sem isso, o front continua sem saber separar as duas trilhas.
5. Garantir que `planFeatureLines()` continua derivando as linhas de "o que está incluso" 100% do
   mapa (nada hardcoded fora daqui).

**Backend**

6. Alinhar o enum/`PlanCode` do backend (hoje documentado como `"solo" | "clinica" | "pro"` na
   `Subscription`, ver `financial-split-spec.md` §176-182) para os 4 códigos novos.
7. Mapear cada `PlanCode` ao respectivo **Stripe Price ID** (assinatura) e à **taxa de split padrão**
   (`DefaultFeeBps`). A taxa efetiva deve vir do backend por plano, não do front.
8. Reconciliar `docs/specs/financial-split-spec.md` §4.3 com a nova tabela (fonte única de preços/taxas).

### Valores a validar (decisão do produto — pendências abertas)

- **Preço do Solo Pro** (mensalidade). *Sem valor definido — precisa decidir.*
- **Preço e taxa do Clínica Pro** (o antigo `PRO` era R$ 99 / 1,99%). *Confirmar se mantém.*
- **Preço "as is" da Clínica:** o config diz **R$ 49**, o spec financeiro diz **R$ 149 + R$ 39/prof
  extra**. *Qual é o correto?*
- **Custo fixo por consulta (+ R$ 1,00):** o spec financeiro prevê taxa **percentual + fixo**; o
  `plan-config` só modela percentual. *Manter só percentual (10%/5%/…) ou percentual + fixo?*
- **Features do Solo Pro além do WhatsApp:** inclui `custom_branding`/relatórios? *Definir.*

### Critérios de aceite

- A pricing table (dashboard e página pública) mostra 4 planos com os valores/taxas aprovados.
- Nenhum preço/limite/taxa hardcoded fora de `plan-config.ts` (front) e da config do backend.
- A taxa exibida por plano bate com a taxa que o backend efetivamente aplica no split.

---

## Q2. Esconder "Clínica" para quem está no plano individual (Solo)

### Estado atual

O item de menu **"Clínica"** (`/dashboard/team`) é renderizado **estaticamente** para todos os
usuários — ver `app/(dashboard)/layout.tsx` (desktop linha ~110 e mobile linha ~154). Não há
checagem de plano. O layout **já busca** o billing (`getPrimaryTeamBilling()`, linha ~8), então o
dado necessário para decidir já está disponível ali.

### Objetivo

O bloco de **Clínica** (menu + rotas) só deve aparecer para quem está numa trilha **clínica**
(`CLINICA`/`CLINICA_PRO`) — ou, durante o trial, conforme regra a definir. Para Solo/Solo Pro, some.

### Etapas

1. No `app/(dashboard)/layout.tsx`, condicionar os `NavLink` de "Clínica" (desktop e mobile) a uma
   flag derivada do plano — ex.: `isClinicPlan(billing.planCode)` (helper novo em `plan-config.ts`,
   usando o campo `audience` de Q1) **ou** "usuário pertence a alguma clínica".
2. **Defesa em profundidade:** proteger as rotas `app/(dashboard)/dashboard/team/**` com um guard
   (ex.: estender `lib/auth/guards.ts`) que redireciona quem não é de plano clínica — para o link
   não funcionar via URL direta. O backend continua sendo a fonte da verdade (403 → tela amigável).
3. Decidir o comportamento no **trial**: durante o trial de 30 dias hoje tudo fica liberado
   (`hasPremiumAccess`), o que faria a Clínica aparecer para um Solo em trial. *Definir se Clínica
   aparece no trial ou só com plano clínica assinado.*

### Critérios de aceite

- Logado no plano **Solo** (grátis): o item "Clínica" **não** aparece no menu e `/dashboard/team`
  redireciona/bloqueia.
- Logado num plano **Clínica**: aparece normalmente.

### Decisão em aberto

- Clínica visível durante o **trial** de um plano individual? (recomendação: **não** — trial de Solo
  não deveria expor recursos de clínica).

---

## Q3. Tela de planos própria para o usuário individual

### Estado atual

A tela de planos vive em `app/(dashboard)/dashboard/team/plans/page.tsx` — ou seja, **debaixo de
"Clínica"** (`/dashboard/team/...`) e renderizada com `ClinicTabs` (contexto de clínica). O
`PremiumGate` e o `TrialBanner` apontam todos para `PLANS_ROUTE = "/dashboard/team/plans"`
(`components/billing/premium-gate.tsx`). Para um Solo/free, isso é incoerente: ele cai numa área de
clínica para ver/trocar plano, e vê os tiers de clínica misturados.

### Objetivo

Ter uma **tela de planos acessível fora do contexto de clínica**, adequada ao usuário individual,
mostrando primeiro a trilha individual (Solo / Solo Pro) e a trilha de clínica como seção separada
("para clínicas") — sem `ClinicTabs`.

### Etapas

1. Criar uma rota neutra de planos, ex.: `app/(dashboard)/dashboard/plans/page.tsx` (ou
   `/dashboard/assinatura`), **sem** o wrapper de clínica.
2. Renderizar a pricing table agrupada por `audience` (Q1): **Individual** (Solo, Solo Pro) e
   **Clínica** (Clínica, Clínica Pro). Para um Solo, destacar Solo Pro como upgrade natural.
3. Atualizar `PLANS_ROUTE` em `components/billing/premium-gate.tsx` (e quaisquer CTAs do
   `TrialBanner`) para a nova rota neutra.
4. Decidir o destino do **checkout individual**: hoje o billing é **por clínica**
   (`BillingController` = `/api/v1/teams/{teamId}/billing`). Um Solo Pro (sem clínica) precisa de um
   caminho de assinatura **para pessoa/usuário**, não para `Team`. Ver Q3-backend abaixo.
5. Manter a tela antiga `/dashboard/team/plans` **apenas** para o contexto de clínica (ou redirecionar
   para a nova, filtrando pela trilha de clínica).

### Q3-backend (dependência) — assinatura individual

O checkout atual assume `teamId`. Para vender **Solo Pro** a um profissional sem clínica, é preciso:

6. Um caminho de billing por **usuário** (ex.: `POST /api/v1/billing/checkout` sem `teamId`, ou
   criar automaticamente um `Team` "pessoal" de 1 assento por baixo dos panos). *Decidir a modelagem.*
7. O `TeamBillingDto`/contrato de status precisa refletir assinatura individual (planCode individual).

### Critérios de aceite

- Um Solo consegue ver e assinar **Solo Pro** sem passar por nenhuma tela de "clínica".
- Os CTAs de upgrade (PremiumGate/TrialBanner) levam à tela de planos neutra.

### Decisão em aberto

- Modelagem da assinatura individual: **billing por usuário** vs **"clínica pessoal" de 1 assento**.

---

## Q4. Recebimentos — "configurar conta para receber" não abre

### Resposta direta à dúvida

Sim: ativar recebimentos depende de um provedor de pagamento (**Stripe Connect** para cartão e/ou
**Mercado Pago Split** para PIX) que **ainda não foi criado/integrado**. Não é só uma chave faltando
— a integração de sub-conta ainda é um **esqueleto**.

### Estado atual

- Front: `components/payouts/payout-status-card.tsx` → `handleActivate()` chama
  `startPayoutOnboardingAction("STRIPE")` (`lib/actions/payouts.ts`), que faz `POST /payouts/onboarding`
  esperando um `onboardingUrl` do provedor para redirecionar.
- Backend: `PayoutsController` existe, mas é **esqueleto da Fase 2** — delega a
  `IPayoutAccountService.StartOnboardingAsync`, cuja integração real com Stripe Connect / MP Split
  **não está implementada** (ver `financial-split-spec.md` §6.1 e §7.3: "o split de marketplace não
  existe"). Sem `onboardingUrl` real, o botão falha silenciosamente / mostra erro e "não abre".
- A página `recebimentos/page.tsx` cai para `MOCK_PAYOUT_ACCOUNT` quando o backend não responde.

### Objetivo

Fazer o botão "Ativar recebimentos" levar o profissional a um cadastro **real** de conta de
recebimento e refletir o status verdadeiro (PENDING/ACTIVE/RESTRICTED).

### Etapas

**Pré-requisitos de conta/infra (fora do código)**

1. Criar/configurar a conta **Stripe** e habilitar **Connect** (Express) — e/ou credenciais de
   **Mercado Pago** (para split PIX). Definir chaves no backend (secrets no Render).
2. Configurar o **webhook** do provedor (KYC concluído → marcar conta `ACTIVE`). Guia:
   `docs/local-webhooks-setup.md` já cobre Stripe Connect (`/api/v1/webhooks/stripe/connect`) e MP.

**Backend**

3. Implementar `IPayoutAccountService.StartOnboardingAsync` de verdade: criar/obter a sub-conta no
   provedor, gerar o **Account Link** (Stripe Connect Express) e retornar `onboardingUrl`.
4. Implementar o webhook de status (KYC/atualização) para transicionar `PayoutAccount.Status`.
5. `GET /payouts` deve devolver a conta real do profissional (com `status` e `onboardingUrl` de retomada).

**Frontend**

6. Nenhuma mudança estrutural — remover o **fallback de mock** em `recebimentos/page.tsx` quando o
   backend estiver real (ou manter o mock só em dev). A UI já está pronta.

### Critérios de aceite

- Clicar em "Ativar recebimentos" redireciona ao provedor (KYC) e volta com status coerente.
- Sem mock em produção: o card reflete o estado real da sub-conta.

### Decisão em aberto

- **Provedor v1**: começar só com **Stripe Connect (cartão)**, só **MP Split (PIX)**, ou os dois?
  (o `financial-split-spec.md` §3.2 recomenda híbrido: PIX→MP, cartão→Stripe.)

---

## Q5. Painel financeiro exibindo dados fake

### Estado atual

`app/(dashboard)/dashboard/financeiro/page.tsx` tenta `GET /finance/summary` e, ao falhar, usa
`MOCK_FINANCE_DASHBOARD` com `isDemo = true` (mostra o selo "Dados de demonstração"). O
`FinanceController` do backend **ainda não está finalizado** — é justamente o item marcado como
**"🔴 BLOQUEIA FASE 5"** em `docs/backend-backlog.md` (endpoints de leitura financeira / projeção).

Mesma situação no **financeiro consolidado da clínica** (`/dashboard/team/financeiro`, mock de
`team-finance`).

### Objetivo

Substituir os números fake por dados reais (ou esconder o painel enquanto não houver dados).

### Etapas

**Backend**

1. Implementar o `FinanceController` conforme `docs/backend-backlog.md` (§ "Endpoints de leitura
   financeira") — projeção de MRR/churn/LTV/faturamento a partir dos snapshots imutáveis de `Booking`.
2. Expor `GET /finance/summary` (individual) e o equivalente consolidado da clínica.

**Frontend**

3. Remover o fallback `MOCK_FINANCE_DASHBOARD` (e o selo `isDemo`) quando a API responder — a UI
   (`MetricCards`, `RevenueChart`) já está pronta.
4. **Enquanto o backend não vem:** decidir o comportamento interino — manter o selo "demonstração"
   (transparente) **ou** exibir um **empty state** ("Sem dados ainda") em vez de números inventados.
   *Recomendação: empty state*, para não passar impressão de dado real.

### Critérios de aceite

- Com backend pronto: os números batem com os agendamentos pagos reais; sem selo de demonstração.
- Sem backend: nenhuma métrica inventada é exibida como se fosse real.

### Dependência

- Q5 depende do `FinanceController` (mesmo gap que já bloqueava a Fase 5). Também se beneficia de Q4
  (dados de recebimento reais alimentam parte do faturamento).

---

## Q6. Validar que a diferenciação de planos é realmente aplicada

### Estado atual

Hoje o gating é **UX** (`PremiumGate`, `canUseFeature`, `hasPremiumAccess` em `plan-config.ts`) e o
billing cai para **`MOCK_TEAM_BILLING`** (trial de 30 dias) quando o backend não expõe
`planCode`/`trial` (`frontend/lib/api/billing.ts`). Ou seja: **a regra de negócio não é garantida** —
um usuário poderia, na prática, não ter a diferenciação aplicada de verdade, e o front "libera" no
trial por padrão.

### Objetivo

Garantir que cada plano aplica seus limites/taxas/features **de verdade**, validado ponta a ponta.

### Etapas

1. **Backend como fonte da verdade** (spec §2.5): cada request sensível revalida plano/limite e
   responde **403** quando fora do plano (o front já trata 403 com tela amigável). Conferir que isso
   existe para: features premium, limite de agendamentos/mês, nº de profissionais, tipos de consulta.
2. **Taxa de split por plano:** confirmar que o backend aplica a `feeBps` correta por `PlanCode`
   (10%/5%/2,49%/~1,99%) no cálculo do split — não só exibe no front.
3. **Trial:** revisar `hasPremiumAccess` — hoje trial libera **tudo**. Definir se o trial de um plano
   individual deve liberar recursos de clínica (ver Q2). Ajustar a regra conforme decisão.
4. **Remover os mocks de billing** em produção (`MOCK_TEAM_BILLING`) assim que o contrato real de
   `planCode`/`trial`/`limits`/`usage` estiver disponível.
5. **Matriz de teste** (fazer explicitamente): para cada plano (Solo, Solo Pro, Clínica, Clínica Pro)
   × cada recurso gateado, verificar liberado/bloqueado esperado — incluindo tentativa por URL direta.

### Critérios de aceite

- Um Solo (grátis) é bloqueado (com 403 real, não só UX) ao tentar: exceder limite de agendamentos,
  usar WhatsApp reminders, abrir área de clínica.
- Solo Pro libera agendamentos/tipos ilimitados + WhatsApp e aplica taxa 5% no split.
- Nenhum mock de billing em produção.

---

## Apêndice A — Resumo de arquivos afetados (por área)

| Área | Frontend | Backend |
|---|---|---|
| Q1 Planos | `lib/plans/plan-config.ts` | enum `PlanCode`, mapa Stripe Price ↔ plano, `DefaultFeeBps`; `docs/specs/financial-split-spec.md` |
| Q2 Gating Clínica | `app/(dashboard)/layout.tsx`, `lib/auth/guards.ts` | policies de clínica (403) |
| Q3 Tela de planos | nova rota `dashboard/plans/*`, `components/billing/premium-gate.tsx` (`PLANS_ROUTE`), `TrialBanner` | billing por usuário / "clínica pessoal" |
| Q4 Recebimentos | `recebimentos/page.tsx` (remover mock) | `PayoutsController` + `IPayoutAccountService` (Stripe Connect / MP), webhooks |
| Q5 Financeiro | `dashboard/financeiro/page.tsx`, `team/financeiro` (remover mock) | `FinanceController` (`GET /finance/summary`) |
| Q6 Validação | `lib/api/billing.ts` (remover mock), `plan-config.ts` (trial) | enforcement de limites/taxa/features (403) |

## Apêndice B — Decisões de produto pendentes (consolidado)

1. Preço do **Solo Pro** (mensalidade).
2. Preço e taxa do **Clínica Pro** (validar se mantém R$ 99 / 1,99%).
3. Preço correto da **Clínica** — R$ 49 (config) vs R$ 149 + R$ 39/prof (spec financeiro).
4. Taxa **só percentual** (10%/5%/…) ou **percentual + fixo (+R$ 1,00)** por consulta.
5. Features do **Solo Pro** além do WhatsApp (branding? relatórios?).
6. **Clínica visível no trial** de plano individual? (recomendação: não.)
7. Provedor de recebimento **v1**: Stripe Connect, MP Split, ou híbrido.
8. Modelagem da **assinatura individual**: billing por usuário vs "clínica pessoal" de 1 assento.
9. Comportamento interino do **Financeiro** sem backend: selo de demonstração vs empty state.
