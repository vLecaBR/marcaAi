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

## F6 — Notificações e integrações

- [ ] **Resend:** criar conta, verificar o domínio (SPF/DKIM/DMARC na Cloudflare), definir `Resend__ApiKey` e `Resend__FromEmail` (`MarcaAí <nao-responda@SEUDOMINIO>`). Em produção a API **não sobe** sem remetente verificado.
- [ ] Conferir em produção que os e-mails chegam na caixa de entrada (não spam) — critério de aceite da F6.
- [ ] **Google Cloud Console:** cadastrar **dois** redirect URIs: `https://api.SEUDOMINIO/api/v1/auth/google/callback` (login) e `https://api.SEUDOMINIO/api/v1/integrations/google-calendar/callback` (conectar agenda).
- [ ] Publicar o app no Google (tela de consentimento) com o login em escopos não sensíveis; **submeter a verificação** do escopo `calendar.events` (necessária para usuários externos na conexão de agenda).
- [ ] **WhatsApp (D8 = opcional, fora do MVP):** nada foi ligado. Se quiser depois: serviço `evolution` no compose de produção com `profiles: [whatsapp]` (F9), número dedicado, volume baixo. Sem `WhatsApp__ApiUrl/ApiKey` os lembretes saem só por e-mail.
- [ ] Testar o fluxo real "Conectar Google Agenda" no navegador (consentimento → callback → evento criado na agenda). O backend foi testado até o redirecionamento ao Google.
- [ ] Tokens do Google em `accounts` continuam em texto no banco (G09) — cifrar na F7.

## F7 — Segurança, LGPD e hardening

- [ ] **Texto jurídico:** advogado revisar `/privacidade` e `/termos` (hoje "versão preliminar", `rascunho-2026-11`); ao publicar a versão final, atualizar `Privacy__PolicyVersion` e remover o aviso.
- [ ] **D10:** confirmar o prazo de retenção (24 meses, provisório) com o advogado.
- [ ] **D13:** definir o encarregado e definir `DPO_EMAIL` no `.env` do front (rodapé e política).
- [ ] **Segredos:** gerar a nova `Jwt__SigningKey` e rotacionar as chaves antigas (checklist em `docs/security-secrets.md`).
- [ ] **Backup do Supabase:** confirmar que `marcaai-supabase.dump` está guardado fora do PC (cópia criptografada) e definir prazo de descarte (G14).
- [ ] **ZAP baseline:** varredura OWASP não executada (exige baixar a imagem Docker do ZAP — pedir autorização) e o app completo no ar.
- [ ] RIPD, ROPA, política de incidentes e DPAs finais (`.lgpd/`): rodar as skills `lgpd-ripd`, `lgpd-ropa`, `lgpd-incident-response` quando houver encarregado/advogado.
- [ ] CSP com nonce (hoje `unsafe-inline` em script/style) — endurecimento futuro.
- [ ] Antiforgery no BFF ainda não validado de ponta a ponta (achado #17).
- [ ] Achados #16/#17 (cancelamento/consulta por uid adivinhável, antiforgery) seguem abertos.

## Gerais (de fases anteriores)
- [ ] **Reativar o CI** (`.github/workflows/ci.yml`): desativado em 07/11/2026 por falta de minutos do GitHub Actions (hoje só `workflow_dispatch`). Restaurar o gatilho `push`/`pull_request` na `main` quando houver minutos; enquanto isso, validar localmente com `./build.sh`.
- [ ] Parar o serviço nativo PostgreSQL 17 (porta 5432), como administrador.
- [ ] Prazo de descarte do dump do Supabase e do banco de dev com dados reais (G14).
- [ ] Decidir se `PROMPT_CLAUDE_CODE.md` é commitado ou ignorado.
- [ ] Testes visuais das telas novas no navegador e e2e Playwright (F8).
