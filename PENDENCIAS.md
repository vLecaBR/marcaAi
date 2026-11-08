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

## V2 — Qualidade e robustez (08/11/2026)

- [ ] 🧑 Preencher `ADMIN_USER_IDS` no `.env.prod` com o seu id (`select id, email from users` — veja `docs/runbook.md`) para abrir o `/admin`.
- [ ] Sentry/GlitchTip externo (opcional): hoje os erros ficam na tabela `error_events` e no `/admin`; um DSN permitiria alerta por e-mail/Telegram.
- [ ] Alerta ativo: o `/admin` mostra erros, mas ninguém é avisado. Ligar o monitor externo (F9) e, se quiser, um aviso quando `errors.last24h` passar de um limite.
- [ ] CSP com nonce (hoje `unsafe-inline` em script/style).
- [ ] Repetir o teste de carga no PC de produção (com o túnel) e antes do beta (`docs/load-test.md`).
- [ ] E2E contra a stack completa do compose de produção (hoje: build de produção do Next + API em Development com pagamento simulado).
- [ ] Lembrete de 24 h e ver um e-mail de lembrete real chegar (depende do Resend).
- [ ] Cache de `GET /slots/month` e do perfil público se a carga real pedir.

## V1 — Produto (07/11/2026)

- [ ] Anexar o `.ics` ao e-mail de confirmação (hoje só na página da consulta): exige suporte a anexos no `IEmailClient`/Resend.
- [ ] Lembrete de 24 h (hoje só 2 h antes da consulta).
- [ ] Favicon e imagem OG próprios (precisa de arte).
- [ ] Remarcar consulta **paga** mantém o pagamento original; decidir se remarcar para outro serviço/valor deve cobrar a diferença.
- [ ] `GET /slots/month` calcula até 31 dias por chamada: cachear se a carga (V2) mostrar custo.
- [x] Antiforgery dos novos POSTs públicos coberto pela guarda de origem (V2).

## F9 — Deploy de produção (no PC)

- [ ] 🧑 Domínio na Cloudflare, túnel criado e `CLOUDFLARE_TUNNEL_TOKEN` no `.env.prod` (guia: `docs/deploy-self-host.md` §2). Sem o token o container `cloudflared` reinicia em loop (esperado).
- [ ] 🧑 Preencher o `.env.prod` real (cópia no cofre de senhas) e subir com `scripts\deploy.ps1 -NoPull`.
- [ ] 🧑 Backup: gerar o par de chaves `age` (privada **fora do PC**), criar o bucket R2 e os `R2_*`; rodar `backup.sh` e o teste de restauração a partir do R2.
- [ ] 🧑 Windows 24/7: Docker Desktop no login, login automático, energia sem suspensão, BitLocker, nobreak (guia §6; parte exige administrador).
- [ ] 🧑 Monitor externo (UptimeRobot/Better Stack) para `/health` e `/login` + heartbeat do backup.
- [ ] 🤖 Exercitar o rollback automático do `deploy.ps1` com uma falha forçada (só o caminho feliz foi testado).
- [ ] `evolution-api` (WhatsApp) fora do compose — só se D8 mudar.
- [ ] Monitorar o disco `C:` (~9 GB livres em 07/11/2026): `docker system df`, `docker image prune`.
- [ ] Execução do plano de venda (`PLANO_DE_VENDA.md`): **começar hoje as esperas E1–E11** (domínio, Resend, Google, Stripe, advogado, contador).

## F8 — Testes e CI

- [ ] **Rodar o `ci.yml` no GitHub** quando houver minutos (Actions → Run workflow; marcar `e2e` para o Playwright) e ajustar o que falhar. O workflow foi reescrito mas **nunca executou lá** (aceite "CI verde nos dois jobs" em aberto).
- [ ] Decidir se o E2E deve rodar contra `next build && next start` em vez de `next dev` (mais estável e fiel; mais lento para subir).
- [ ] Cobertura do front (`npm run test:coverage`, limiar 70% no `vitest.config.ts`) não foi medida nem exigida; só o `lib/` crítico tem teste.
- [ ] Teste automatizado do rate limit (hoje só verificado por script na F7; na suíte o limite é multiplicado por `RateLimit:Multiplier`).
- [ ] UX (fora do escopo): o calendário público habilita fins de semana e o dia de hoje mesmo sem agenda; só mostra "Nenhum horário disponível" depois do clique.

## F7 — Segurança, LGPD e hardening

- [ ] **Texto jurídico:** advogado revisar `/privacidade` e `/termos` (hoje "versão preliminar", `rascunho-2026-11`); ao publicar a versão final, atualizar `Privacy__PolicyVersion` e remover o aviso.
- [ ] **D10:** confirmar o prazo de retenção (24 meses, provisório) com o advogado.
- [ ] **D13:** definir o encarregado e definir `DPO_EMAIL` no `.env` do front (rodapé e política).
- [ ] **Segredos:** gerar a nova `Jwt__SigningKey` e rotacionar as chaves antigas (checklist em `docs/security-secrets.md`).
- [ ] **Backup do Supabase:** confirmar que `marcaai-supabase.dump` está guardado fora do PC (cópia criptografada) e definir prazo de descarte (G14).
- [ ] **ZAP baseline:** varredura OWASP não executada (exige baixar a imagem Docker do ZAP — pedir autorização) e o app completo no ar.
- [ ] RIPD, ROPA, política de incidentes e DPAs finais (`.lgpd/`): rodar as skills `lgpd-ripd`, `lgpd-ropa`, `lgpd-incident-response` quando houver encarregado/advogado.
- [ ] CSP com nonce (hoje `unsafe-inline` em script/style) — endurecimento futuro.
- [x] Antiforgery/CSRF (achado #17): guarda de origem na API + teste (V2).
- [x] Achado #16 (uid adivinhável): uid aleatório de 128 bits para consultas novas (V2). Consultas antigas mantêm o CUID; em produção o banco começa limpo.

## Gerais (de fases anteriores)
- [ ] **Reativar o CI** (`.github/workflows/ci.yml`): desativado em 07/11/2026 por falta de minutos do GitHub Actions (hoje só `workflow_dispatch`). Restaurar o gatilho `push`/`pull_request` na `main` quando houver minutos; enquanto isso, validar localmente com `./build.sh`.
- [ ] Parar o serviço nativo PostgreSQL 17 (porta 5432), como administrador.
- [ ] Prazo de descarte do dump do Supabase e do banco de dev com dados reais (G14).
- [ ] Decidir se `PROMPT_CLAUDE_CODE.md` é commitado ou ignorado.
- [ ] Testes visuais das telas novas no navegador e e2e Playwright (F8).
