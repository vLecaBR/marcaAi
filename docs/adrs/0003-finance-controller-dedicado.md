# ADR-0003 — `FinanceController` dedicado para leitura financeira

- **Status:** Accepted
- **Data:** 2026-07-25
- **Contexto na spec:** `frontend-healthtech-spec.md` §6.3 e §10.3
- **Gera dependência de backend:** ver `docs/backend-backlog.md` (bloqueia a Fase 5)

## Contexto

O Dashboard Financeiro (§6) depende de **leitura agregada** sobre o snapshot imutável do `Booking`
(`PriceCents`, `PlatformFeeCents`, `GatewayFeeCents`, `NetToProviderCents`, `PaymentProvider`,
`PaidAt`, `RefundedAt`, `PaymentStatus`). Hoje existe `GET /api/v1/bookings` (lista operacional do
profissional), mas **sem os campos financeiros no DTO de lista**, e sem endpoints de sumário/extrato.
A spec (§10.3) deixa em aberto: **estender o DTO existente** vs **criar um controller dedicado**.

## Decisão

Criar um **`FinanceController` dedicado** com um `IFinanceReportService` (projeções de leitura,
estilo CQRS-read) no backend, expondo:

- `GET /api/v1/finance/summary?from&to` — cards do profissional (§6.1).
- `GET /api/v1/finance/statement?from&to&status&provider` — extrato líquido por consulta (§6.1).
- `GET /api/v1/finance/teams/{teamId}/summary` — consolidado da clínica (§6.2).

Agregação (somas de centavos, ticket médio) é feita **no servidor**, não no cliente.

## Alternativas consideradas

**A. Estender `BookingListItemDto` com os campos financeiros.** Rejeitada: mistura duas
responsabilidades com evoluções distintas (lista operacional × relatório financeiro); vaza dados
financeiros para telas que não precisam deles, contrariando a minimização de exposição de PII/dados
sensíveis (§8); prende os dois contextos ao mesmo shape de resposta; e empurra a agregação para o
cliente.

## Consequências

**Positivas:** separação de contextos limpa; superfície financeira isolada e auditável; agregação
no servidor (correta e barata); sem impacto na lista operacional. Como o snapshot já é imutável
após `PAID`, isto é **pura camada de projeção — sem migração destrutiva** (alinhado à §12 da spec
financeira).

**Negativas:** é uma dependência de backend que **bloqueia a Fase 5 do frontend** — precisa entrar
no backlog do .NET já (registrado em `docs/backend-backlog.md`), senão o front trava.

**Neutras:** deixa espaço natural para o rateio interno v2 (`RevenueShareRule`), que também será um
endpoint de leitura sob o mesmo controller.
