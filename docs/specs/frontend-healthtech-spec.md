# Frontend Healthtech Spec — MarcaAí

**Status:** Draft para revisão · **Data:** 2026-07-25 · **Escopo:** Next.js (App Router) consumindo a API .NET
**Regra:** documento de especificação. Nenhum código React/Next escrito até aprovação. Fonte da verdade de negócio = Domain/Spec do backend (`financial-split-spec.md`).

---

## 1. Objetivo

Migrar o frontend do MarcaAí de um modelo acoplado (Server Actions + Prisma no próprio Next) para um **cliente da API .NET** (Clean Architecture já implementada nas Fases 1–4), e adequar o produto ao nicho **Healthtech** (profissionais de saúde e pacientes). O documento também especifica o **Dashboard Financeiro** que expõe o split de pagamentos (repasses, extrato líquido) e prepara o terreno para o rateio interno da clínica (v2).

Três frentes:

1. **Migração de acesso a dados:** substituir Server Actions/Prisma por chamadas HTTP à API .NET.
2. **UX Healthtech:** design system, tom de voz e fluxos pensados para saúde.
3. **Dashboard Financeiro:** visão do profissional (repasses do split) e da clínica (consolidado + rateio futuro).

---

## 2. Estado atual e alvo

| Camada | Hoje | Alvo |
|---|---|---|
| Dados | Server Actions chamando Prisma direto no Next | Chamadas HTTP à API .NET (`/api/v1/...`) |
| Auth | Sessão NextAuth no próprio app | JWT em cookie HttpOnly emitido pela API (.NET) + magic link / Google OIDC |
| Autorização | Middleware `proxy.ts` | Policies no backend (`Onboarded`, `TeamOwner`, `TeamManager`) + guardas de rota no front |
| Pagamento | PIX simples sem split | Split (PIX/MP + Cartão/Stripe Connect) via `/bookings/{uid}/pay` |
| Fonte da verdade | Schema Prisma no front | Domain EF Core (backend). Prisma do front vira read-only/legado |

**Diretriz:** o front **não** acessa mais o banco diretamente. Toda leitura/escrita passa pela API. O `prisma/schema` do front é congelado (referência de tipos legada) até ser removido.

---

## 3. Migração: Server Actions → API .NET

### 3.1 Camada de acesso (a especificar na implementação)

- Um **cliente HTTP** único (fetch wrapper) com: base URL (`NEXT_PUBLIC_API_URL`), `credentials: "include"` (envia o cookie HttpOnly), injeção do header **CSRF** (`X-XSRF-TOKEN` lido do cookie `marcaai_csrf`), e tratamento padronizado de erros **ProblemDetails** (RFC 7807) que a API retorna.
- **Server Components** fazem leitura server-side repassando o cookie de sessão; **mutations** podem continuar em Server Actions, mas a Action passa a ser um *proxy fino* que chama a API (sem Prisma). Alternativa: Route Handlers como BFF. Decisão de implementação — recomenda-se **Server Action fina como proxy** para manter o cookie HttpOnly fora do JS do cliente.
- **CORS/CSRF já configurados no backend** (`Program.cs`): origem do front liberada, `AllowCredentials`, antiforgery com header `X-XSRF-TOKEN` e cookie `SameSite=Strict`.

### 3.2 Inventário de endpoints (contrato atual da API)

| Domínio | Método + Rota | Uso no front |
|---|---|---|
| Auth | `POST /api/v1/auth/magic-link/request` · `GET /api/v1/auth/magic-link/verify` · `POST /api/v1/auth/refresh` · `GET /api/v1/auth/me` · `POST /api/v1/auth/logout` | Login sem senha, sessão, refresh |
| Google | `GET /api/v1/auth/google/start` · `GET /api/v1/auth/google/complete` | Login Google + Calendar |
| Perfil | `GET /api/v1/me` · `PUT /api/v1/me/profile` · `POST /api/v1/me/onboarding/complete` | Onboarding e perfil do profissional |
| Clínicas | `GET/PUT /api/v1/teams/{id}` · `POST /api/v1/teams/{id}/members` · `DELETE /api/v1/teams/{id}/members/{userId}` | Gestão de clínica e membros |
| Tipos de consulta | `GET /api/v1/event-types` · `PUT /api/v1/event-types/{id}` · `PATCH /api/v1/event-types/{id}/status` · `DELETE /api/v1/event-types/{id}` | Serviços/consultas e preço |
| Agenda | `PUT /api/v1/schedules/{id}/availability` · `POST /api/v1/schedules/{id}/exceptions` · `DELETE /api/v1/exceptions/{id}` | Disponibilidade e bloqueios |
| Slots | `GET /api/v1/slots` | Horários livres (página pública) |
| Página pública | `GET /api/v1/public/{username}` | Perfil público de agendamento |
| Agendamentos | `POST /api/v1/bookings` · `GET /api/v1/bookings` · `GET /api/v1/bookings/{uid}` · `POST /api/v1/bookings/{uid}/cancel` · **`POST /api/v1/bookings/{uid}/pay`** | Agendar, listar, detalhar, cancelar, **pagar (split)** |
| Assinatura SaaS | `GET /api/v1/teams/{teamId}/billing` · `POST /api/v1/teams/{teamId}/billing/checkout` | Plano/assinatura da clínica |
| Recebimentos (split) | `POST /api/v1/payouts/onboarding` · `GET /api/v1/payouts` · `GET /api/v1/payouts/{provider}/status` · `GET /api/v1/payouts/teams/{teamId}` · `DELETE /api/v1/payouts/{id}` | Onboarding e status da sub-conta |

> Webhooks (`/api/v1/webhooks/*`) são servidor-a-servidor; o front nunca os chama.

### 3.3 Contrato de pagamento (crítico para a UX)

`POST /api/v1/bookings/{uid}/pay` com corpo `{ "provider": "MERCADO_PAGO" | "STRIPE" }` retorna:

- **Cartão (STRIPE):** `clientSecret` → o front confirma com **Stripe.js/Elements** (não manipula cartão fora do gateway).
- **PIX (MERCADO_PAGO):** `pixQrCode` (copia-e-cola) + `pixQrCodeBase64` (imagem) + `pixTicketUrl`.
- Comum: `providerPaymentId`, `amountCents`, `applicationFeeCents`.

A confirmação real (`PAID`) chega por **webhook** — a UI deve refletir estado **pendente** e fazer *polling* de `GET /api/v1/bookings/{uid}` (ou aguardar realtime futuro) até virar pago.

### 3.4 Estados de erro (ProblemDetails)

Mapear os códigos que a API já retorna para mensagens de UX (ver §5.3 copy): `409` conflito de horário / consulta já paga / conta de recebimento inativa; `422` duração inválida / fora da disponibilidade / consulta sem preço; `404` não encontrado; `502` falha no provedor de pagamento.

---

## 4. UX Healthtech — Design System

### 4.1 Princípios

Confiança clínica, clareza e acessibilidade. Público duplo: **profissional de saúde** (dashboard/gestão) e **paciente** (agendamento/pagamento). Menos "SaaS genérico roxo", mais **saúde: sério, calmo, acessível**.

### 4.2 Paleta (proposta — validar com marca)

| Token | Cor | Uso |
|---|---|---|
| `--brand-primary` | Teal/verde-azulado (ex.: `#0F9E8E`) | Ações primárias, confiança/saúde |
| `--brand-secondary` | Azul profundo (ex.: `#134E6F`) | Cabeçalhos, navegação |
| `--accent-care` | Verde suave (ex.: `#3FBF8F`) | Sucesso, "consulta confirmada" |
| `--warning` | Âmbar (ex.: `#E9A23B`) | Pendências (pagamento pendente) |
| `--danger` | Vermelho contido (ex.: `#D64550`) | Cancelamento, erro |
| `--surface` / `--bg` | Neutros claros (ex.: `#F7FAF9` / `#FFFFFF`) | Fundo clínico, "limpo" |
| `--text` | Cinza-azulado escuro (ex.: `#1B2A34`) | Alto contraste |

> Substituir o roxo `#7c3aed` (default atual em `User.BrandColor`/`Team.BrandColor`) pela paleta acima. Como `BrandColor` é por profissional/clínica, o design system deve tratar a cor de marca como **token temável** com fallback teal.

### 4.3 Tipografia e acessibilidade

- Fonte legível e "clínica" (ex.: Inter/Source Sans). Escala com bom contraste.
- **WCAG AA** mínimo (contraste ≥ 4.5:1). Alvos de toque ≥ 44px. Foco visível. Suporte a leitores de tela nos fluxos de agendamento e pagamento.
- Datas/horas sempre com **timezone explícito** (o backend trabalha em UTC e guarda `GuestTimeZone`) — exibir "no seu fuso" para o paciente.

### 4.4 Componentes-chave

Cartão de consulta (status colorido: pendente/confirmada/paga/cancelada), seletor de slots, tela de pagamento (aba PIX × Cartão), badge de status de recebimento ("Recebimentos ativos"), estados vazios acolhedores.

---

## 5. Copywriting Healthtech

### 5.1 Tom de voz

Profissional, acolhedor, sem jargão. Nunca alarmista. Para pacientes: **tranquilizador e claro**. Para profissionais: **eficiente e respeitoso** com a rotina clínica. Evitar prometer resultados de saúde; a plataforma agenda e processa pagamento — não presta serviço médico.

### 5.2 Exemplos — paciente

- Agendamento: "Escolha o melhor horário para sua consulta."
- Pagamento PIX: "Pague com PIX para confirmar sua consulta. Escaneie o QR Code ou copie o código."
- Aguardando: "Estamos confirmando seu pagamento. Isso costuma levar alguns segundos."
- Confirmado: "Consulta confirmada! Você receberá os detalhes por e-mail."

### 5.3 Exemplos — profissional/clínica

- Onboarding de recebimento: "Ative seus recebimentos para receber pelas consultas direto na sua conta."
- Conta pendente: "Falta pouco: conclua seu cadastro no provedor para começar a receber."
- Fee transparente: "A cada consulta paga, uma taxa de plataforma de X% é retida; o restante vai direto para você."

### 5.4 Regras de conteúdo sensível

Não usar linguagem que diagnostique ou aconselhe clinicamente. Deixar claro que valores são estimativas quando aplicável e que a confirmação de pagamento é assíncrona.

---

## 6. Dashboard Financeiro

O coração da adequação Healthtech B2B2C. Duas visões: **profissional** e **clínica**. Baseia-se no **snapshot imutável do `Booking`** (já gravado nas Fases 2–4): `PriceCents`, `PlatformFeeCents`, `GatewayFeeCents`, `NetToProviderCents`, `PaymentProvider`, `PayoutAccountId`, `PaidAt`, `RefundedAt`, `PaymentStatus`.

### 6.1 Visão do Profissional — "Meus Recebimentos"

Objetivo: o profissional vê **a fatia dele já calculada** (líquido), não o bruto.

- **Cards de topo:** líquido recebido no período (`Σ NetToProviderCents` de bookings `PAID`), a receber (pendentes), taxas pagas (`Σ PlatformFeeCents`), nº de consultas pagas.
- **Extrato líquido (tabela):** por consulta — data, paciente, tipo, **bruto**, **taxa MarcaAí**, **líquido**, provedor (PIX/Cartão), status (pago/pendente/reembolsado).
- **Status de recebimento:** badge do `PayoutAccount` (PENDING/ACTIVE/RESTRICTED) com CTA de onboarding quando não ativo.
- **Filtros:** período, status de pagamento, provedor.

### 6.2 Visão da Clínica — "Financeiro da Clínica"

Objetivo: consolidado do que a clínica recebeu (na v1 a clínica recebe 100% do líquido, §10.3 da spec financeira).

- **Consolidado:** líquido total da clínica, por profissional (agregação de bookings cujo recebedor é o `Team`), taxas, ticket médio.
- **Plano/fee vigente:** exibir `PlanCode`, `Quantity` (assentos) e `DefaultFeeBps` da `Subscription` — deixando claro que **plano maior = fee de split menor** (Solo 3,49% / Clínica 2,49% / Pro 1,99%).
- **Rateio interno (v2 — placeholder):** seção "em breve" para quando a clínica definir o percentual de cada profissional (`RevenueShareRule`, §12.1 da spec financeira). A UI deve **prever o espaço** (coluna "sua fatia") sem implementar cálculo agora.

### 6.3 Dados e endpoints necessários (gap a preencher no backend)

O dashboard depende de **endpoints de leitura agregada que ainda não existem**. Hoje há `GET /api/v1/bookings` (lista do profissional) com `PaymentStatus`, mas **sem os campos financeiros do snapshot** no DTO de lista. Propor para a próxima fase de backend:

- Estender `BookingListItemDto` (ou criar `FinanceController`/`IFinanceReportService`) para expor `PriceCents`, `PlatformFeeCents`, `NetToProviderCents`, `PaymentProvider`, `PaidAt`, `RefundedAt`.
- Endpoints sugeridos: `GET /api/v1/finance/summary?from&to` (cards), `GET /api/v1/finance/statement?from&to&status&provider` (extrato), `GET /api/v1/finance/teams/{teamId}/summary` (clínica).
- Base de dados já suficiente (snapshot imutável); falta apenas a camada de leitura/projeção. **Nenhuma migração destrutiva** — alinhado à §12 da spec financeira.

> **Importante:** manter o snapshot financeiro do `Booking` imutável após `PAID` é o único gancho que habilita tanto o extrato quanto o rateio v2 (já garantido no backend).

### 6.4 Estados assíncronos

Pagamento é confirmado por webhook. O dashboard deve tratar: `PENDING` (aguardando), `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED` — com rótulos e cores da §4.2, e refresh/polling.

---

## 7. Rotas do app (proposta)

| Rota | Público | Descrição |
|---|---|---|
| `/[username]` | Paciente | Perfil público + agendamento |
| `/[username]/[eventType]` | Paciente | Slots + dados + pagamento |
| `/booking/{uid}` | Paciente | Confirmação/status (polling de pagamento) |
| `/dashboard` | Profissional | Visão geral (próximas consultas) |
| `/dashboard/agenda` | Profissional | Disponibilidade e exceções |
| `/dashboard/consultas` | Profissional | Lista/gestão de bookings |
| `/dashboard/servicos` | Profissional | Event types + preço |
| `/dashboard/recebimentos` | Profissional | Onboarding + extrato líquido (§6.1) |
| `/dashboard/teams/{teamId}/financeiro` | Clínica | Consolidado + plano/fee (§6.2) |
| `/dashboard/teams/{teamId}/assinatura` | Clínica | Billing/checkout SaaS |
| `/onboarding` | Profissional | Fluxo pós-cadastro |

---

## 8. Segurança e conformidade (front)

- Cookie de sessão **HttpOnly** — o JS do cliente nunca lê o token; leitura de sessão via `GET /api/v1/auth/me` server-side.
- **CSRF**: enviar `X-XSRF-TOKEN` em toda mutation (o backend exige antiforgery).
- **Cartão**: sempre via Stripe.js/Elements. O front **não** trafega PAN.
- **Dados de saúde/PII**: minimizar exposição; não logar dados de paciente no cliente; mascarar quando possível.
- **Timezones**: exibir sempre no fuso do usuário; nunca assumir o fuso do servidor.

---

## 9. Faseamento sugerido (frontend)

- **F1 — Fundação:** cliente HTTP + auth (cookie/CSRF) + tratamento ProblemDetails; migrar leitura/escrita básicas (perfil, event types, agenda).
- **F2 — Agendamento público:** página pública, slots, criar booking.
- **F3 — Pagamento com split:** tela PIX × Cartão consumindo `/pay`; polling de confirmação.
- **F4 — Recebimentos:** onboarding de `PayoutAccount` + status.
- **F5 — Dashboard Financeiro:** extrato líquido do profissional (requer endpoints de leitura do §6.3).
- **F6 — Clínica:** consolidado + plano/fee; placeholder de rateio v2.
- **F7 — Polimento Healthtech:** design system final, acessibilidade AA, copy revisada.

---

## 10. Decisões em aberto (para o próximo chat)

1. **BFF:** Server Actions finas (proxy) vs Route Handlers como BFF — definir padrão único.
2. **Realtime vs polling** na confirmação de pagamento.
3. **Endpoints financeiros de leitura** (§6.3): estender DTO existente ou criar `FinanceController` dedicado.
4. **Cor de marca temável** por profissional/clínica × identidade Healthtech fixa — grau de customização permitido.
5. **i18n:** pt-BR primeiro; estrutura para futura internacionalização.

---

## Sources / Referências internas

- `docs/specs/financial-split-spec.md` (modelagem, fee dinâmica §4.3, rateio v2 §12).
- Contrato de API: controllers em `backend/src/MarcaAi.Api/Controllers` (inventário §3.2).
- `docs/local-webhooks-setup.md` (confirmação assíncrona de pagamento em ambiente local).
