# Pendências do dono e itens adiados

Lista viva de tudo que ficou para depois por depender de contas externas, decisões ou ações manuais. Cada item aponta a fase de origem no `PLANO_DE_LANCAMENTO.md`. Marque `[x]` quando resolver.

## F5 — Pagamentos (adiado por falta de contas)

### Stripe (ainda não será configurado)
- [ ] Conta Stripe Brasil ativada (CNPJ), **Connect** habilitado e perfil da plataforma completo.
- [ ] Criar os preços recorrentes (Solo Pro, Clínica, Clínica Pro) e configurar `Stripe:Prices:*`.
- [ ] `Stripe:SecretKey`, `Stripe:WebhookSecret`, `Stripe:ConnectWebhookSecret` em user-secrets / `.env` (nunca no git).
- [ ] Criar os 2 destinos de webhook com API version `2026-10-28.endive` (`/webhooks/stripe` e `/webhooks/stripe/connect`).
- [ ] Rodar o roteiro de `docs/local-webhooks-setup.md` (`stripe listen`) e **todo** o `docs/test-checklist.md` em modo teste; registrar o resultado no §9 do plano.
- [ ] Pagamento real de R$ 1–5 em modo live (F10) chegando à conta conectada com a taxa correta.

### Mercado Pago (PIX)
- [ ] Criar aplicação no Mercado Pago e configurar `MercadoPago:ClientId`, `ClientSecret`, `WebhookSecret`, `RedirectUri`, `NotificationUrl`.
- [ ] `DataProtection:KeysPath` em pasta persistente **fora do repositório** (e no backup, F9).
- [ ] Testar OAuth do vendedor e um PIX real em sandbox.
- [ ] Enquanto não houver MP configurado: o PIX segue indisponível (o paciente vê aviso de cadastro de recebimentos incompleto).

### Decisões / LGPD ligadas à F5
- [ ] G22: descrição enviada aos gateways ("Consulta: título") — tornar genérica?
- [ ] G23: arquivar DPA do Stripe e do Mercado Pago; confirmar mecanismo de transferência internacional (`.lgpd/vendors/`, `.lgpd/transfers/`).
- [ ] Limpeza periódica de `processed_webhook_events` (F7).

## Gerais (de fases anteriores)
- [ ] Parar o serviço nativo PostgreSQL 17 (porta 5432), como administrador.
- [ ] D13: definir encarregado (DPO) e advogado para revisar `/privacidade` e `/termos` (G01 — hoje 404).
- [ ] Prazo de descarte do dump do Supabase e do banco de dev com dados reais (G14).
- [ ] Decidir se `PROMPT_CLAUDE_CODE.md` é commitado ou ignorado.
- [ ] Testes visuais das telas novas no navegador e e2e Playwright (F8).
