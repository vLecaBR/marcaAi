# Testando Webhooks Localmente — MarcaAí

Guia prático para receber e testar os webhooks do **Stripe** (Billing + Connect) e do **Mercado Pago** na sua máquina, com a API rodando em `http://localhost:5080`.

> **Por que preciso disso?** Os provedores enviam eventos (pagamento aprovado, KYC concluído, reembolso) via HTTP POST para uma URL pública. Sua máquina não é pública, então usamos o **Stripe CLI** (que faz um túnel próprio) e o **ngrok** (túnel genérico, necessário para o Mercado Pago).

Endpoints que vamos exercitar:

| Provedor | Evento | Rota local |
|---|---|---|
| Stripe Billing | assinatura SaaS | `POST /api/v1/webhooks/stripe` |
| Stripe Connect | KYC + split de cartão | `POST /api/v1/webhooks/stripe/connect` |
| Mercado Pago | PIX (split) | `POST /api/v1/webhooks/mercadopago` |

---

## 0. Pré-requisitos

- API rodando: a partir de `backend/`, execute `dotnet run --project src/MarcaAi.Api` e confirme que sobe em `http://localhost:5080` (ajuste a porta em `src/MarcaAi.Api/Properties/launchSettings.json` se necessário).
- Conta no Stripe (modo teste) e no Mercado Pago (credenciais de teste).

### Onde colocar os segredos

Nunca comite segredos. Use o **user-secrets** do .NET (por projeto), a partir de `backend/src/MarcaAi.Api`:

```powershell
dotnet user-secrets init
dotnet user-secrets set "Stripe:SecretKey" "sk_test_xxx"
dotnet user-secrets set "Stripe:WebhookSecret" "whsec_do_billing"
dotnet user-secrets set "Stripe:ConnectWebhookSecret" "whsec_do_connect"
dotnet user-secrets set "MercadoPago:AccessToken" "APP_USR-xxx"
dotnet user-secrets set "MercadoPago:NotificationUrl" "https://SEU-SUBDOMINIO.ngrok-free.app/api/v1/webhooks/mercadopago"
```

> Reinicie a API depois de alterar qualquer segredo.

---

## 1. Instalar as ferramentas (Windows)

Com **winget** (recomendado):

```powershell
winget install Stripe.StripeCli
winget install Ngrok.Ngrok
```

Alternativa com **Scoop**:

```powershell
scoop install stripe
scoop install ngrok
```

Verifique:

```powershell
stripe --version
ngrok --version
```

---

## 2. Stripe — Billing e Connect

O Stripe CLI cria o túnel **e** imprime o *signing secret* (`whsec_...`) de cada sessão. Como nossa API valida os dois endpoints com **secrets diferentes** (`Stripe:WebhookSecret` × `Stripe:ConnectWebhookSecret`), rode **dois listeners em terminais separados**, cada um com o seu secret.

### 2.0. Login (uma vez)

```powershell
stripe login
```

### 2.1. Terminal A — eventos de conta (Billing)

```powershell
stripe listen --forward-to localhost:5080/api/v1/webhooks/stripe
```

Copie o `whsec_...` exibido → esse é o **`Stripe:WebhookSecret`**.

### 2.2. Terminal B — eventos do Connect

O flag `--forward-connect-to` encaminha os eventos de **contas conectadas** (Connect):

```powershell
stripe listen --forward-connect-to localhost:5080/api/v1/webhooks/stripe/connect
```

Copie o `whsec_...` desta sessão → esse é o **`Stripe:ConnectWebhookSecret`**.

> Atualize os dois segredos via `dotnet user-secrets` (seção 0) e reinicie a API.

### 2.3. Disparar eventos de teste

Em um **terceiro terminal**:

```powershell
# Billing (assinatura SaaS) — grava PlanCode/Quantity/DefaultFeeBps
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted

# Connect (KYC da sub-conta + split de cartão)
stripe trigger account.updated
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
```

Observe os logs da API: `account.updated` deve mover o `PayoutAccount` para `ACTIVE`; `payment_intent.succeeded` deve gravar o snapshot e marcar o `Booking` como `PAID`.

> **Dica:** os eventos de plano precisam bater com seus price ids. Configure `Stripe:Prices:Solo`, `Stripe:Prices:Clinica` e `Stripe:Prices:Pro` para que o mapeamento de `PlanCode/DefaultFeeBps` funcione.

---

## 3. Mercado Pago — PIX (via ngrok)

O Mercado Pago **não** tem um CLI de túnel; ele precisa de uma URL pública real. Use o ngrok.

### 3.1. Subir o túnel

```powershell
ngrok http 5080
```

O ngrok mostra uma linha como:

```
Forwarding  https://a1b2-200-x-x-x.ngrok-free.app -> http://localhost:5080
```

### 3.2. Apontar o MP para o túnel

1. Defina `MercadoPago:NotificationUrl` para
   `https://a1b2-200-x-x-x.ngrok-free.app/api/v1/webhooks/mercadopago` (via `dotnet user-secrets`, seção 0) e reinicie a API.
2. No painel do Mercado Pago (Suas integrações → sua aplicação → Webhooks), cadastre a mesma URL para o tópico **Pagamentos**, se quiser receber notificações reais do sandbox.

### 3.3. Simular uma notificação

O MP envia o **id do pagamento**; nossa API consulta o status e concilia pelo `external_reference` (o `Uid` do booking). Para simular sem gerar um PIX real, faça um POST direto (troque `PAYMENT_ID` por um id real de teste do MP):

```powershell
curl -X POST "http://localhost:5080/api/v1/webhooks/mercadopago?data.id=PAYMENT_ID" `
  -H "Content-Type: application/json" `
  -d '{ "type": "payment", "data": { "id": "PAYMENT_ID" } }'
```

Se o pagamento estiver `approved` e o `external_reference` casar com um `Booking`, ele vira `PAID` (com proteção contra double-processing).

> **Fluxo ponta a ponta:** gere um PIX real de teste via `POST /api/v1/bookings/{uid}/pay` com `{"provider":"MERCADO_PAGO"}`, pague no sandbox do MP e deixe a notificação chegar pelo túnel.

---

## 4. Inspecionar o tráfego

- **Stripe CLI**: cada evento aparece no terminal do `stripe listen` (status `[200]` = a API aceitou).
- **ngrok**: abra `http://localhost:4040` para ver/reenviar cada requisição HTTP que passou pelo túnel — ótimo para depurar o payload do MP.

---

## 5. Checklist rápido

- [ ] API em `http://localhost:5080` no ar.
- [ ] `Stripe:SecretKey`, `Stripe:WebhookSecret`, `Stripe:ConnectWebhookSecret` nos user-secrets.
- [ ] Dois `stripe listen` ativos (billing e connect), cada um com seu secret.
- [ ] `ngrok http 5080` ativo e `MercadoPago:NotificationUrl` apontando para o túnel.
- [ ] Eventos de teste disparados e status `200` nos logs.

---

## Referências

- Stripe CLI — https://docs.stripe.com/stripe-cli
- Stripe CLI `listen` (Connect) — https://docs.stripe.com/cli/listen
- Testar webhooks do Stripe — https://docs.stripe.com/webhooks#test-webhook
- ngrok — https://ngrok.com/docs
- Mercado Pago Webhooks/Notificações — https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/notifications/webhooks
