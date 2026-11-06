# Financial Split Spec — MarcaAí

**Status:** Draft para revisão · **Data:** 2026-07-25 · **Escopo:** Domain + Application + Infrastructure + Api
**Regra:** documento de especificação. Nenhum código C# alterado até aprovação.

---

## 1. Objetivo

Consolidar o "coração financeiro" do MarcaAí com **duas vias de monetização integradas**:

1. **SaaS (B2B)** — clínica/profissional paga assinatura mensal para usar a plataforma. Gerido via **Stripe Billing**. Já parcialmente implementado (`Subscription`, `StripeBillingService`, `BillingController`, `StripeWebhookController`).
2. **Split / Marketplace (B2B2C)** — o profissional define o preço da consulta; o paciente paga pela plataforma; o MarcaAí **retém automaticamente uma taxa (application fee)** e repassa o restante direto para a **sub-conta do profissional**. Hoje só existe cobrança PIX simples (`MercadoPagoPixService`) **sem split** — é o gap principal desta spec.

As duas vias são independentes: assinatura ativa é pré-requisito para *usar* a plataforma; o split ocorre por transação de consulta.

---

## 2. Estado atual do Domain (o que já existe)

| Entidade | Campos financeiros hoje | Observação |
|---|---|---|
| `User` | — | Profissional dono da agenda. Sem dados de conta de recebimento. |
| `Team` | `Subscription?` (nav) | Clínica. Assinatura pendura no Team. |
| `EventType` | `int? Price` (centavos), `string Currency = "BRL"` | Preço da consulta já modelado. |
| `Booking` | `PaymentStatus` (UNPAID/PAID/REFUNDED), `string? PaymentReference` | Falta rastrear valores, taxa e provedor. |
| `Subscription` | `StripeCustomerId`, `StripeSubscriptionId`, `StripePriceId`, `StripeCurrentPeriodEnd`, `Status` | SaaS ok; falta plano/quantidade. |

Interfaces já existentes: `IBillingService` (Stripe SaaS), `IPixPaymentService` (MP PIX). Controllers: `BillingController`, `StripeWebhookController`, `MercadoPagoWebhookController`.

**Conclusão:** a base de assinatura está pronta. O split de marketplace **não existe** — nem campos de sub-conta, nem cálculo/registro de taxa, nem repasse.

---

## 3. Viabilidade: Mercado Pago Split vs Stripe Connect

### 3.1 Comparação

| Critério | **Mercado Pago Split** | **Stripe Connect** |
|---|---|---|
| PIX nativo (Brasil) | ✅ Sim, first-class | ⚠️ Suporte limitado/indireto |
| Cartão | ✅ Sim | ✅ Sim (maduro) |
| Onboarding da sub-conta | OAuth de conta MP existente do profissional | Express/Standard account (KYC gerido pela Stripe) |
| Parâmetro de taxa | `marketplace_fee` (Checkout Pro) / `application_fee` (Transparent/Bricks) | `application_fee_amount` (Direct/Destination charges) |
| Ordem da dedução | MP deduz a taxa dele primeiro; a comissão do marketplace incide sobre o restante | Stripe deduz processamento; `application_fee` vai para a plataforma |
| Maturidade no Brasil | Alta para PIX; ecossistema local | Connect disponível p/ Brasil, mas cartão/PIX local menos consolidado que MP |
| Já integrado no MarcaAí | ✅ PIX (sem split ainda) | ✅ SaaS Billing (sem Connect ainda) |

Fontes: ver seção "Sources" ao final.

### 3.2 Recomendação (arquitetura híbrida)

Adotar **estratégia por método de pagamento**, alinhada ao que já está integrado:

- **PIX → Mercado Pago Split** (`application_fee` no pagamento). É onde MP é mais forte e onde já temos código.
- **Cartão → Stripe Connect** (Destination charge com `application_fee_amount`) **ou** também via MP, decidido por feature flag. Recomendação inicial: **Cartão via Stripe Connect**, mantendo Stripe como provedor de cartão já presente.
- **SaaS (assinatura) → Stripe Billing** (mantém como está).

O Domain deve ser **provider-agnóstico**: modelar via um enum `PaymentProvider` e campos de sub-conta genéricos, sem acoplar a um único gateway. Isso permite ligar/desligar cada rota por `EventType`/`Team` sem migração de esquema.

---

## 4. Modelagem financeira

### 4.1 Quem é o "vendedor" (recebedor do split)

Decisão de produto: a sub-conta de recebimento vive no **`User` (profissional autônomo)** e/ou no **`Team` (clínica)**. Regra proposta:

- Consulta de `EventType` **sem `TeamId`** → recebedor = `User`.
- Consulta de `EventType` **com `TeamId`** → recebedor = `Team` (a clínica recebe e faz o rateio interno fora do escopo v1).

Ambos precisam poder armazenar credenciais de sub-conta. Modelamos numa entidade dedicada `PayoutAccount` (1 conta por owner/provider) em vez de espalhar chaves cruas em `User`/`Team`.

### 4.2 De quem é a taxa

A **taxa do MarcaAí (application fee)** é sempre retida do valor da consulta **antes** do repasse ao profissional. Ou seja: o profissional anuncia R$ 200, recebe R$ 200 − (taxa MarcaAí) − (custo do gateway, conforme contrato). Modelo v1:

- **Taxa MarcaAí:** percentual configurável + custo fixo. Sugestão inicial: **2,5% + R$ 1,00** por consulta paga (dentro da faixa 2–5% pedida), com override por `Team` (planos maiores → taxa menor).
- **Custo do gateway:** quem absorve? Decisão v1: **profissional absorve o custo do gateway** (padrão de marketplace); MarcaAí retém apenas sua fee. Alternativa: MarcaAí absorve e cobra fee cheia — flag `AbsorbGatewayCost`.

Fórmula (centavos):

```
gross          = EventType.Price
platformFee    = round(gross * feePercent) + feeFixed
netToProvider  = gross - platformFee - gatewayCost   // gatewayCost=0 se AbsorbGatewayCost
```

Todos os valores gravados no `Booking` para auditoria (nada recalculado a posteriori).

### 4.3 Precificação SaaS sugerida (realista — healthtech BR 2026)

Faixas de mercado para agenda/prontuário SaaS de saúde no Brasil hoje giram tipicamente entre **R$ 50 e R$ 250/mês por profissional**. Proposta de tabela (confirmar com pesquisa de preço dedicada antes de fixar):

| Plano | Alvo | Preço base | Taxa de split | Limites |
|---|---|---|---|---|
| **Free / Trial** | Validação | R$ 0 (14 dias) | 4,99% + R$ 1,00 | 1 profissional, split habilitado com fee maior |
| **Solo** | Autônomo | **R$ 79/mês** | 3,49% + R$ 1,00 | 1 profissional |
| **Clínica** | Clínica pequena | **R$ 149/mês** + R$ 39/prof. extra | 2,49% + R$ 1,00 | até 5 profissionais |
| **Pro / Rede** | Rede/franquia | sob consulta | 1,99% + R$ 1,00 | ilimitado, SLA |

Lógica de negócio: **quanto maior a assinatura, menor a fee de split** (incentivo a subir de plano). A taxa efetiva por `Team` fica em `PayoutAccount`/config, não hard-coded.

---

## 5. Mudanças propostas no Domain

> Apenas especificação. Implementação após aprovação.

### 5.1 Novos enums

```
PaymentProvider  { MERCADO_PAGO, STRIPE }
PayoutAccountStatus { PENDING, ACTIVE, RESTRICTED, DISABLED }
PayoutOwnerType  { USER, TEAM }
```

Estender `PaymentStatus` de `{ UNPAID, PAID, REFUNDED }` para incluir estados do split:
`{ UNPAID, PENDING, PAID, PARTIALLY_REFUNDED, REFUNDED, FAILED }`.

### 5.2 Nova entidade `PayoutAccount` (sub-conta conectada)

Isola as credenciais de recebimento. **Não** guardar tokens crus em `User`/`Team` — referenciar aqui, idealmente com segredos em secret store e só o id/status no banco.

```
PayoutAccount
- Id
- OwnerType        : PayoutOwnerType   // USER ou TEAM
- OwnerId          : string            // UserId ou TeamId
- Provider         : PaymentProvider
- ExternalAccountId: string            // MP user_id / Stripe acct_...
- Status           : PayoutAccountStatus
- ChargesEnabled   : bool
- PayoutsEnabled   : bool
- OnboardingUrl     : string?          // link de conclusão de KYC
- FeePercentBps    : int?              // override de taxa (basis points); null = usa plano
- FeeFixedCents    : int?
- AbsorbGatewayCost: bool = false
- CreatedAt / UpdatedAt
// Segredos (refresh/access token MP, se aplicável) → secret manager, referenciados por chave, não coluna.
```

### 5.3 `User` / `Team`

Sem colunas de credenciais cruas. Apenas navegação:

```
User  += ICollection<PayoutAccount> PayoutAccounts   // OwnerType=USER
Team  += ICollection<PayoutAccount> PayoutAccounts   // OwnerType=TEAM
```

Motivo de não colocar `StripeConnectId`/`MpUserId` direto em `User`/`Team`: um mesmo owner pode ter conta em **dois** providers (PIX no MP + cartão no Stripe), e o status/KYC evolui — merece entidade própria.

### 5.4 `Booking` (auditoria financeira da transação)

Adicionar snapshot imutável dos valores no momento do pagamento:

```
Booking +=
- PriceCents        : int?              // snapshot do EventType.Price
- Currency          : string = "BRL"
- PaymentProvider   : PaymentProvider?
- PayoutAccountId   : string?           // recebedor do split
- PlatformFeeCents  : int?              // taxa MarcaAí retida
- GatewayFeeCents   : int?              // custo do gateway (se conhecido)
- NetToProviderCents: int?              // líquido repassado
- ProviderPaymentId : string?           // id do pagamento no gateway (substitui/complementa PaymentReference)
- PaidAt            : DateTime?
- RefundedAt        : DateTime?
```

`PaymentReference` (já existe) permanece por compatibilidade; `ProviderPaymentId` é o campo canônico novo.

### 5.5 `Subscription` (SaaS)

Pequenos acréscimos para suportar planos/rateio:

```
Subscription +=
- PlanCode         : string?    // "solo" | "clinica" | "pro"
- Quantity         : int = 1     // nº de profissionais (seat-based)
- DefaultFeeBps    : int?        // taxa de split padrão herdada pelo plano
```

### 5.6 (Opcional) `LedgerEntry` — livro-razão

Para conciliação/relatório financeiro, recomenda-se v1.1 uma entidade append-only:

```
LedgerEntry
- Id, BookingId?, SubscriptionId?, Provider, Type (CHARGE|FEE|PAYOUT|REFUND)
- AmountCents, Currency, ProviderRef, OccurredAt
```

Fora do escopo v1, mas o `Booking` já grava o suficiente para reconstruir.

---

## 6. Fluxos

### 6.1 Onboarding da sub-conta (profissional/clínica)

```
1. Owner autenticado clica "Ativar recebimentos" no painel.
2. PayoutsController.CreateOnboarding(provider)
   - MP:     inicia OAuth → salva user_id + tokens (secret store) → PayoutAccount(PENDING)
   - Stripe: cria Express account → Account Link → PayoutAccount(PENDING)
3. Owner conclui KYC no provedor.
4. Webhook (account.updated / MP) → atualiza ChargesEnabled/PayoutsEnabled → Status=ACTIVE.
5. EventType pago só pode ser publicado se existir PayoutAccount ACTIVE do owner correspondente.
```

### 6.2 Pagamento de consulta com split (paciente paga)

```
1. Paciente escolhe slot de um EventType com Price>0.
2. BookingsController.Create → cria Booking (PENDING, UNPAID) + snapshot PriceCents/Currency.
3. Seleciona método:
   - PIX  → ISplitPaymentService(MERCADO_PAGO).CreateCharge(
                amount, applicationFee, sellerAccount=PayoutAccount, externalRef=Booking.Uid)
   - Cartão → ISplitPaymentService(STRIPE).CreateCharge(destination=acct_..., application_fee_amount=fee)
4. Provider processa; taxa do MarcaAí retida na origem; líquido vai à sub-conta.
5. Webhook de pagamento (MercadoPagoWebhookController / StripeWebhookController):
   - valida assinatura
   - localiza Booking por externalRef
   - grava PlatformFeeCents / GatewayFeeCents / NetToProviderCents / ProviderPaymentId / PaidAt
   - PaymentStatus=PAID, Status=CONFIRMED (ou mantém regra de RequiresConfirm)
6. Notificação (INotificationService) ao profissional e paciente.
```

### 6.3 Reembolso / no-show

```
- Cancelamento com reembolso → provider.Refund(ProviderPaymentId)
- Webhook refund → PaymentStatus=REFUNDED/PARTIALLY_REFUNDED, RefundedAt.
- Política de retenção da fee em reembolso = decisão de produto (v1: devolver fee proporcional).
```

### 6.4 Assinatura SaaS (inalterado, só planos)

Mantém `IBillingService` / `StripeBillingService`. Acréscimo: gravar `PlanCode`/`Quantity` a partir do `price_id` do checkout; `DefaultFeeBps` alimenta a fee de split quando `PayoutAccount` não tem override.

---

## 7. Impacto por camada (controllers / services)

### 7.1 Application (novas interfaces / DTOs)

| Artefato | Ação | Papel |
|---|---|---|
| `ISplitPaymentService` | **novo** | Abstração provider-agnóstica: `CreateCharge`, `Refund`, `GetPayment`. Implementações MP e Stripe. |
| `IPayoutAccountService` | **novo** | Onboarding/OAuth/Account Link, status, resolução do recebedor de um Booking. |
| `IPixPaymentService` | **estender** | Adicionar `applicationFee` e `sellerAccount` ao `CreateAsync` (hoje sem split). |
| `IBillingService` | manter | + mapear `PlanCode`/`Quantity` no webhook. |
| `Features/Payments/SplitModels.cs` | **novo** | `SplitCharge`, `SplitQuote`, `RefundResult`. |
| `Features/Payouts/PayoutDtos.cs` | **novo** | `OnboardingResult`, `PayoutAccountDto`. |
| Serviço de cálculo de fee | **novo** | `FeeCalculator` puro (gross→fee→net), testável em unidade. |

### 7.2 Infrastructure

| Artefato | Ação |
|---|---|
| `MercadoPagoPixService` | estender p/ enviar `application_fee` + `collector`/sub-conta. |
| `MercadoPagoSplitService` | **novo** (impl. `ISplitPaymentService` para PIX/cartão MP). |
| `StripeConnectService` | **novo** (impl. `ISplitPaymentService` para cartão via Destination charge). |
| `StripeBillingService` | pequeno ajuste p/ `PlanCode`/`Quantity`. |
| Secret store p/ tokens MP | **novo** (não persistir refresh token em coluna). |

### 7.3 Api (controllers)

| Controller | Ação |
|---|---|
| `PayoutsController` | **novo** — onboarding, status, desconectar sub-conta. |
| `BookingsController` | estender — selecionar provider, iniciar cobrança com split, retornar QR/redirect. |
| `MercadoPagoWebhookController` | estender — gravar fee/net/refund no Booking. |
| `StripeWebhookController` | estender — eventos `account.updated`, `charge.refunded`, `application_fee.*`. |
| `BillingController` | manter — só refletir plano. |
| `PublicController` | ajustar — página pública de agendamento exibe preço e exige pagamento quando `Price>0`. |

### 7.4 Persistência (Infrastructure/EF + Prisma)

Novas tabelas: `payout_accounts` (+ enum PG `PaymentProvider`, `PayoutAccountStatus`). Colunas novas em `bookings` e `subscriptions`. Enum `PaymentStatus` estendido. **Nota:** o repo tem um `prisma/schema` no frontend/Next — manter os dois esquemas sincronizados (fonte da verdade = EF/Domain).

---

## 8. Configuração / segredos

`.env` deve prever (nomes sugeridos):

```
# Mercado Pago (marketplace)
MP_APP_ID=...
MP_CLIENT_SECRET=...
MP_REDIRECT_URI=...
MP_MARKETPLACE_ACCESS_TOKEN=...
# Stripe Connect
STRIPE_CONNECT_CLIENT_ID=...
STRIPE_SECRET_KEY=...            # já existe p/ Billing
STRIPE_WEBHOOK_SECRET_CONNECT=...
# Fee padrão
PLATFORM_FEE_BPS=250            # 2,5%
PLATFORM_FEE_FIXED_CENTS=100   # R$ 1,00
```

---

## 9. Segurança e conformidade

- **Idempotência** obrigatória nos webhooks (chave = `ProviderPaymentId`) — evitar dupla baixa.
- **Nunca** persistir dados de cartão; tokenização no gateway.
- Tokens OAuth do MP em **secret manager**, não em coluna do banco.
- Validar assinatura de webhook (Stripe `Stripe-Signature`, MP `x-signature`).
- Snapshot financeiro no `Booking` é **imutável** após `PAID` (auditoria fiscal — relevante com a Reforma Tributária 2026 e split payment fiscal).
- Conciliação: relatório mensal por `PayoutAccount` (fora do escopo v1, `LedgerEntry` habilita).

---

## 10. Decisões (aprovadas 2026-07-25)

1. **Provedores:** híbrido — **PIX via Mercado Pago Split**, **Cartão via Stripe Connect**.
2. **Custo do gateway:** o **profissional/clínica absorve** o custo do gateway. MarcaAí retém **apenas** sua comissão de plataforma (`AbsorbGatewayCost = false` por padrão).
3. **Recebedor quando há Team:** a sub-conta da **clínica recebe 100%** do líquido na v1. Rateio interno fica para v2 (ver §12).
4. **Precificação SaaS:** aprovada a tabela da §4.3 (Free / Solo R$ 79 / Clínica R$ 149) para o MVP.
5. **Reembolso:** **devolver a taxa proporcionalmente** ao valor reembolsado (política transparente).

---

## 11. Faseamento sugerido

- **Fase 1** — Enums + `PayoutAccount` + campos de auditoria no `Booking`; `FeeCalculator` (puro, testável).
- **Fase 2** — `PayoutsController` + onboarding MP (PIX split).
- **Fase 3** — Stripe Connect (cartão) + webhooks de refund/account.
- **Fase 4** — Planos SaaS com fee variável + relatórios/`LedgerEntry`.

---

## Sources

- [Mercado Pago — Split de pagamento (marketplace)](https://www.mercadopago.com.br/blog/split-pagamento-complexo-marketplace)
- [Mercado Pago — Split para serviços e beleza](https://www.mercadopago.com.br/blog/split-pagamento-marketplace-servicos-beleza)
- [Mercado Pago — Dividir comissões automaticamente](https://www.mercadopago.com.br/blog/split-de-pagamento-dividir-comissoes-automaticamente)
- [Stripe Connect — Express accounts](https://docs.stripe.com/connect/express-accounts)
- [Stripe Connect — visão geral](https://stripe.com/connect)
- [Split payment e Reforma Tributária 2026 (contexto fiscal)](https://brasilgeo.ai/ecommerce/onclick/fiscal/split-payment-marketplaces/)

---

## 12. Adendo — Roadmap v2 (NÃO implementar agora)

> Registrado em 2026-07-25 para não bloquear decisões de arquitetura da v1. Sem escopo/estimativa aqui — apenas garantir que o modelo v1 comporte isto sem migração destrutiva.

### 12.1 Rateio Interno da Clínica (`Team` → `TeamMember`)

Após a v1 (onde a clínica recebe 100% do líquido), a clínica poderá **definir o percentual de cada profissional** sobre o valor da consulta (ex.: 70% da consulta vai para o Psiquiatra X, 30% fica para a clínica). Precisaremos de uma spec própria cobrindo:

- Nova entidade (provável) `RevenueShareRule` / `TeamMemberShare`: `TeamId`, `TeamMemberId` (ou `UserId`), `EventTypeId?` (regra por tipo de consulta ou global), `SharePercentBps`, vigência.
- Distribuição pode ser **contábil** (líquido cai na conta da clínica e o rateio é registro interno/relatório) ou **transacional** (sub-split real para sub-contas dos profissionais). Decisão de produto na spec v2.
- Compatibilidade v1: como o `Booking` já grava `PayoutAccountId` + valores líquidos imutáveis, o rateio v2 é **derivável** desses registros sem reprocessar pagamentos. **Nenhum campo v1 precisa mudar** para isto — só entidades novas.

### 12.2 Dashboard Financeiro (frontend)

Painel onde **o profissional visualiza sua fatia já calculada** (não o bruto da clínica) e a clínica vê o consolidado. Depende de:

- `LedgerEntry` (§5.6) como fonte de conciliação, e das `RevenueShareRule` acima para computar a fatia individual.
- Endpoints de leitura agregados (por período, por profissional, por status de pagamento). Provavelmente um `FinanceController` / `IFinanceReportService` novos.
- Nenhuma dependência que exija antecipar trabalho na v1 além de **manter os snapshots financeiros do `Booking` imutáveis** (já previsto na §9).

> **Diretriz de arquitetura:** manter o snapshot financeiro no `Booking` completo e imutável é o que habilita tanto o rateio interno quanto o dashboard sem retrabalho. É o único "gancho" que a v1 precisa deixar pronto.
