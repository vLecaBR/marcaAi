# Mapa de Dados — MarcaAí

**Versão**: v0.2 (F4: consentimento, perfil profissional, trial; linha de base reverso do código) · **Data**: 06/11/2026 · **Owner global**: Encarregado (pendente — D13)
**Fonte**: entidades em `backend/src/MarcaAi.Domain/Entities`, migrations, controllers e frontend. **Nenhum dado real foi lido.**
**Papéis (a validar com advogado):** o profissional/clínica é **controlador** dos dados dos pacientes; o MarcaAí é **operador** deles. Para os dados do próprio profissional (conta, cobrança), o MarcaAí é **controlador**.
**Status:** rascunho técnico — base legal, retenção e RIPD ainda NÃO definidos (F7).

## Atividades de tratamento

| ID | Atividade | Titulares | Dados | Sensível? | Sistema | Operadores / compartilhamento | Base legal | Retenção | Alto risco? |
|---|---|---|---|---|---|---|---|---|---|
| A001 | Cadastro e autenticação do profissional (magic link, Google OAuth, sessão) | Profissionais (adultos) | nome, e-mail, imagem, username, fuso, locale; `verification_tokens`, `sessions` | Não | `users`, `sessions`, `verification_tokens` | Resend (e-mail), Google (login) | a definir (Art. 7º, V — contrato) | **indefinida** | Não |
| A002 | Integração Google Agenda (FreeBusy, criação de evento/Meet) | Profissionais | **tokens OAuth** (refresh/access/id token), escopos Calendar | Não (mas credencial) | `accounts` (⚠ verificar se criptografado) | Google | a definir (consentimento/contrato) | **indefinida** | Não |
| A003 | Perfil e onboarding profissional | Profissionais | bio, marca, tema, **especialidade, conselho profissional, nº de registro, clínica** (F4) | Não | `users`, `schedules*` | — | a definir | **indefinida** | Não |
| A004 | **Agendamento público de consulta** | **Pacientes** | **nome, e-mail, telefone, observações (`GuestNotes`), fuso, respostas a perguntas (`booking_responses`), horário e tipo da consulta** | **SIM — saúde (Art. 5º, II / 11)**: consulta com profissional de saúde + texto livre + respostas do formulário pré-consulta. **Consentimento registrado** (`ConsentAt`/`ConsentVersion`, F4) | `bookings`, `booking_responses` | Google Calendar/Meet (se conectado), Resend, Evolution/WhatsApp, Stripe/Mercado Pago | a definir (Art. 11 — tutela da saúde / consentimento) | **indefinida** | **SIM** (dado sensível em escala → RIPD) |
| A005 | Pagamento da consulta (cartão/PIX, split) | Pacientes + profissionais | valor, taxas, `PaymentReference`, `ProviderPaymentId`, status, datas | Financeiro (vinculado a A004) | `bookings` | Stripe (Connect), Mercado Pago | a definir (Art. 7º, V) | **indefinida** (fiscal: ver advogado) | Médio |
| A006 | Recebimentos do profissional (Stripe Connect / MP) | Profissionais / clínicas | `ExternalAccountId`, status, taxas | Não (KYC fica no provedor) | `payout_accounts` | Stripe, Mercado Pago | Art. 7º, V | indefinida | Não |
| A007 | Assinatura SaaS (plano, trial) | Profissionais / clínicas | `StripeCustomerId`, `StripeSubscriptionId`, plano, período, `TrialEndsAt` (trial interno, F4) | Não | `user_subscriptions`, `subscriptions` | Stripe | Art. 7º, V | indefinida | Não |
| A008 | Clínicas e equipes (membros, papéis) | Profissionais | `team_members` (userId, papel), nome/logo da clínica | Não | `teams`, `team_members` | — | Art. 7º, V | indefinida | Não |
| A009 | Lembretes e notificações (e-mail/WhatsApp, job Hangfire a cada 15 min) | Pacientes | e-mail, telefone, horário/tipo da consulta | **Sim** (deriva de A004) | Hangfire (schema `hangfire`) | Resend, **Evolution API (não oficial)** | a definir | indefinida | **SIM** (herda A004) |
| A010 | Logs da aplicação | Todos | ⚠ e-mail/telefone/corpo de respostas de provedores em logs (ver `gaps.md` G07) | Potencialmente | stdout / `docker logs` | — | Art. 6º, VII (segurança) — a validar | **indefinida** | Médio |
| A011 | Cookies e storage do frontend | Todos | JWT em cookie HttpOnly (`marcaai_at`/`_rt`), CSRF, intenção de plano (storage do navegador) | Não | navegador | — | Art. 7º, V (essenciais) | sessão / 30 dias | Não |
| A012 | Backups (dump do Supabase; futuro backup diário) e banco de dev com dados reais | Todos | **cópia integral** de A001–A009 | **Sim** | `C:\Code\marcaAi-backup\marcaai-supabase.dump` (fora do repo); banco de dev local | Futuro: Cloudflare R2/B2 | Art. 6º, VII — segurança | **indefinida** (dump antigo precisa de prazo de descarte) | **SIM** |

## Operadores identificados (a auditar em `lgpd-vendor-audit`, F5/F6)
Stripe (EUA) · Mercado Pago · Resend (EUA) · Google (Calendar/OAuth, EUA) · Evolution API (auto-hospedada, não oficial) · Cloudflare (Tunnel/DNS, futuro) · Supabase (a ser **excluído** na F10) · Vercel/Render (a desligar).
**Transferência internacional: sim** (Stripe, Resend, Google) → `lgpd-international-transfer`.

## Ambiente de dev com dados reais
O banco de **dev** (localhost:5433) recebeu o dump do Supabase (poucos registros reais: usuários, bookings, uma clínica). Tratado como A012: fica só em localhost, sem exposição, e deve ser descartado quando não for mais necessário.

## Pendências deste mapa
- [ ] Confirmar se `accounts.*Token` está criptografado em repouso (hoje: provavelmente texto puro).
- [ ] Definir retenção para cada atividade (sem "indefinido") — F4/F7.
- [ ] Definir base legal (`legal-basis.md`) — F7.
- [ ] Menores: não há verificação de idade; avaliar se pacientes < 18 se aplicam (ECA Digital) — F7.
