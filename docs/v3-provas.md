# V3 — Provas com provedores reais (modo teste)

Objetivo: provar, **uma vez**, que o que foi testado com simulação funciona com Stripe, Resend e Google de verdade, sem dinheiro real. Cada prova tem comando, resultado esperado e onde registrar (§9 do `PLANO_DE_LANCAMENTO.md`).

**Antes de tudo:** `node scripts/v3-readiness.mjs --env .env.prod --online` (confere formato das chaves, DNS do remetente e, com `--online`, consulta Stripe e Resend só para leitura). Só prossiga sem ✘.

## 0. Subir um ambiente de prova
- Em casa, sem domínio: use `docker-compose.dev.yml` + API local e o **Stripe CLI** (`docs/local-webhooks-setup.md`) para receber webhooks. Com domínio: stack de produção + túnel (`docs/deploy-self-host.md`).
- Chaves **de teste** (`sk_test_`, `pk_test_`). Nunca `sk_live_` nesta fase.

## 1. E-mail (Resend)
| Prova | Como | Esperado |
|---|---|---|
| Magic link chega | Pedir o link com um Gmail e um Outlook seus | Na **caixa de entrada** (não spam), em < 1 min, remetente correto |
| Reputação | Enviar um link para o endereço de teste do mail-tester.com | Nota ≥ 9/10 (SPF, DKIM e DMARC alinhados) |
| Confirmação de consulta | Agendar como paciente com um e-mail seu | Chegam o e-mail do paciente e o do profissional; botão "Gerenciar consulta" abre a página certa |
| Lembrete | Agendar para daqui a ~1 h; o job roda a cada 15 min | E-mail "Lembrete — …" chega uma vez |

## 2. Stripe (cartão, Connect e assinatura)
Cartões de teste: `4242 4242 4242 4242` (aprova), `4000 0000 0000 9995` (recusa), `4000 0025 0000 3155` (3-D Secure). Qualquer validade futura e CVC.
| Prova | Como | Esperado |
|---|---|---|
| Onboarding Connect | Dashboard → Recebimentos → ativar (conta Express de teste) | Conta vira ACTIVE (webhook `account.updated`) |
| Serviço pago | Criar serviço com preço | Só é aceito depois da conta ACTIVE (regra D14) |
| Pagamento | Paciente agenda, paga com 4242 | Consulta CONFIRMED; `PaidAt` e taxa corretas no Financeiro; e-mail de confirmação |
| Recusa e 3DS | Cartões 9995 e 3155 | Recusa mostra erro e mantém a reserva até o prazo; 3DS conclui e confirma |
| Expiração | Reservar e não pagar por 15 min | Reserva cancelada sozinha, horário livre |
| Pagamento tardio | Pagar depois do prazo (Stripe CLI: `stripe trigger payment_intent.succeeded` com o metadata) | Reembolso automático |
| Reembolso | Cancelar como profissional / paciente com 24 h+ | `REFUNDED` e valor devolvido |
| Assinatura do SaaS | Plano Solo Pro (cartão de teste) → trial → cobrança → cancelar | Estados refletidos em Planos; webhook de billing aplicado |
| Idempotência | Reenviar o mesmo evento (`stripe events resend`) | Segunda entrega ignorada |
Roteiro completo de webhooks: `docs/test-checklist.md`.

## 3. PIX (Mercado Pago sandbox) — se D7 incluir
OAuth do vendedor de teste → criar PIX → aprovar no sandbox → baixa pelo webhook; conferir assinatura do webhook e a baixa idempotente.

## 4. Google
| Prova | Esperado |
|---|---|
| Login com Google (conta sua) | Cria/entra no usuário e cai no onboarding/dashboard |
| Conectar Google Agenda | Consentimento → callback → `GoogleCalendar` conectado em Integrações |
| Agendar com Meet | Evento criado na agenda do profissional com o link do Meet; o paciente recebe o link |
| Remarcar e cancelar | O evento é movido/removido |
Redirects a cadastrar: `https://api.SEUDOMINIO/api/v1/auth/google/callback` e `.../integrations/google-calendar/callback`. Enquanto a verificação do Google não sai, o app fica em "modo teste" (até 100 usuários, só os e-mails de teste cadastrados).

## 5. Fechamento
- [ ] Todas as linhas acima marcadas, com data e observação no §9 do plano.
- [ ] Nenhum segredo em logs, prints ou git.
- [ ] Itens que falharem viram pendência com causa (provedor × nosso código) antes da V4.
