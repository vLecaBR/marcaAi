# ADR-0002 — Confirmação de pagamento via polling com backoff (realtime adiado)

- **Status:** Accepted
- **Data:** 2026-07-25
- **Contexto na spec:** `frontend-healthtech-spec.md` §3.3, §6.4 e §10.2

## Contexto

A confirmação de pagamento (`PAID`) chega por **webhook server-a-servidor**; o front nunca
recebe o evento diretamente. Após `POST /bookings/{uid}/pay`, a UI fica em estado **pendente** e
precisa descobrir quando o pagamento foi confirmado. A janela típica de PIX/cartão é de segundos.
A spec (§10.2) deixa em aberto **realtime vs polling**.

## Decisão

Usar **polling com backoff exponencial** como mecanismo de confirmação na v1, encapsulado atrás
de uma abstração trocável (hook `usePaymentStatus(uid)`), com realtime (SSE) previsto mas **não**
implementado agora.

- Polling de `GET /api/v1/bookings/{uid}` com backoff (ex.: 2s → 3s → 5s), teto ~90s.
- Ao expirar sem confirmação: mensagem "avisaremos por e-mail" (a confirmação assíncrona continua
  pelo webhook + e-mail, independente da aba aberta).
- A **fonte da verdade é sempre o snapshot do backend** (`PaymentStatus`), nunca estado otimista
  no cliente. O poll é idempotente e resiliente a falhas transitórias.
- Estados tratados: `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED` (§6.4).

## Alternativas consideradas

**A. Realtime via WebSocket.** Rejeitada para v1: conexão bidirecional persistente é overkill para
um sinal unidirecional e de curta duração; custo de escalar e manter no .NET; pior travessia de
proxies/CDN.

**B. Realtime via SSE.** É a evolução natural quando houver necessidade (SLA sub-segundo, muitos
estados push simultâneos): unidirecional, mais barato, atravessa proxies melhor que WebSocket. Por
isso a abstração `usePaymentStatus` é desenhada para trocar a implementação interna (poll → SSE)
sem tocar a UI. Não se justifica agora dado o custo/benefício.

## Consequências

**Positivas:** zero infraestrutura nova; resolve ~95% dos casos em segundos; degrada com elegância
(e-mail) quando a aba fecha; UI desacoplada do mecanismo.

**Negativas:** carga marginal de requisições de poll (mitigada pelo backoff e teto); latência
percebida de alguns segundos no pior caso.

**Neutras:** migração para SSE é uma troca localizada na implementação do hook, sem refactor de UI.
