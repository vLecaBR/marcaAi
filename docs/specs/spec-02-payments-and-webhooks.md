# Spec 02: Pagamentos e Webhooks Seguros (Stripe / MercadoPago)

## 1. Contexto e Objetivo
A aplicação possui endpoints para recebimento de webhooks de plataformas de pagamento (`app/api/webhooks/stripe/route.ts` e Mercado Pago). Atualmente, a implementação de webhooks no Stripe acessa variáveis diretamente via `process.env` e possui tipagem fraca (`as any`), além de não garantir idempotência ou resiliência contra falhas no banco.

O objetivo desta Spec é:
1. **Refatorar Tipagem e Env:** Usar validação Zod (`env.ts`) para os segredos dos webhooks, evitando falhas silenciosas.
2. **Garantir Idempotência:** Webhooks podem ser entregues mais de uma vez. A lógica de atualização no banco de dados deve ser segura e idempotente.
3. **Isolamento e Segurança:** Prevenir acessos maliciosos simulando payloads de webhooks, garantindo a validação estrita da assinatura criptográfica (`Stripe-Signature`).
4. **Tratamento de Erros:** Remover respostas detalhadas de erro para o cliente em caso de falha de validação (evita vazamento de info da infraestrutura).

## 2. Arquivos Afetados
- `app/api/webhooks/stripe/route.ts`
- `app/api/webhooks/mercadopago/route.ts` (se existente/aplicável)
- `lib/env.ts` (Garantir presença do `STRIPE_WEBHOOK_SECRET` e `MERCADOPAGO_WEBHOOK_SECRET`)
- `package.json` (checar dependência do Stripe)

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Configuração Segura do Ambiente
Em `lib/env.ts`, certifique-se de que `STRIPE_WEBHOOK_SECRET` seja obrigatório se a integração Stripe estiver ativada. Exporte essas variáveis com segurança.

### Passo 3.2: Refatoração do Webhook do Stripe
Em `app/api/webhooks/stripe/route.ts`:
1. Mude `process.env.STRIPE_WEBHOOK_SECRET` para `env.STRIPE_WEBHOOK_SECRET`.
2. Dentro do bloco `catch` de `constructEvent`, **nunca** retorne o `error.message` puro ao cliente, pois isso é um vazamento de informações. Retorne um erro genérico: `new NextResponse("Webhook signature verification failed.", { status: 400 })`.
3. Substitua as asserções `as any` por tipos do `@stripe/stripe-js` ou `Stripe` do pacote do servidor. Acesse as propriedades de forma segura (ex: `stripe.subscriptions.retrieve(session.subscription as string)` e verifique se a resposta é válida).
4. Envolva as chamadas de banco de dados (`prisma.subscription.upsert`, etc.) em blocos `try/catch` internos com logs para o servidor, garantindo que se o DB falhar, retornemos 500 para o Stripe (fazendo-o tentar novamente).

### Passo 3.3: Idempotência nas Atualizações
Verifique se a modelagem no Prisma (com `upsert` usando `teamId` único e `stripeSubscriptionId` único) garante a idempotência correta no evento `checkout.session.completed` e `invoice.payment_succeeded`. O `upsert` por natureza ajuda, mas certifique-se de que a data final do período seja atualizada corretamente.

## 4. Critérios de Aceite
1. Executar testes não deve quebrar por falta de tipagem (`any`).
2. Tentar enviar um request POST para `/api/webhooks/stripe` sem o header `Stripe-Signature` deve falhar imediatamente com status 400 e sem vazar stack trace.
3. Se o banco de dados falhar durante o processamento de um webhook válido, a API deve retornar 500 para acionar o *retry* da plataforma de pagamento.