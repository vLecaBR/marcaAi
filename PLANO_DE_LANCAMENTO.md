# MarcaAí — Plano de Retomada, Self-Hosting e Lançamento

> **Para o Claude Code:** este é o documento-mestre de execução. Leia-o inteiro antes de começar.
> Execute **uma fase por vez**, na ordem. Ao terminar cada fase: marque os checkboxes (`- [x]`),
> preencha o "Registro de execução" no fim do arquivo, rode as verificações da fase e **pare para o
> dono revisar** antes de seguir. Itens marcados com 🧑 são **decisões do dono** — pergunte antes
> de implementar. Nunca comite segredos. **Conformidade LGPD é contínua:** toda fase passa pelo "gate LGPD" da §5.0 (skills do repositório [goul4rt/lgpd-skills](https://github.com/goul4rt/lgpd-skills)).

**Data do diagnóstico:** 06/11/2026 · **Última atualização do plano:** 06/11/2026 (backup do Supabase concluído) · **Último commit analisado:** `866566d` (05/08/2026) · branch `main` sincronizada com `origin/main` (github.com/vLecaBR/marcaAi)

---

## 0. Status rápido (leia primeiro)

| Item | Status |
|---|---|
| Diagnóstico do código + este plano | ✅ feito (06/11/2026) |
| **Ação imediata — backup do Supabase** | ✅ **feito (06/11/2026)** — ver detalhes na seção "Ação imediata" |
| Docker Desktop no PC do dono | ✅ instalado e funcionando (engine Linux/WSL2) — imagem `postgres:18-alpine` já baixada |
| PostgreSQL 17 nativo no Windows | ⚠️ instalado via `winget install PostgreSQL.PostgreSQL.17` durante o backup — **provavelmente roda como serviço do Windows na porta 5432** e vai conflitar com o Postgres do Docker. Tratado na F0. |
| F0 — Higiene do repo e ambiente de dev | ✅ concluída na branch `fase-0-higiene` (aguardando revisão/merge); pendente do dono: parar o serviço do PostgreSQL 17 nativo (admin) |
| LGPD contínua (`goul4rt/lgpd-skills`) | 📌 incorporada ao plano (§5.0, gates por fase, D12). Skills instaladas em `.claude/skills/` (cópia fixa, commit `d85d79a`, D12 ✅ 06/11/2026). Ainda não executei o `lgpd-audit` de linha de base. |
| F4 — Gaps de produto | ✅ concluída (merge na `main` em 07/11/2026) |
| F5 — Pagamentos ponta a ponta | 🟡 código pronto na branch `fase-5-pagamentos`; faltam contas Stripe/MP e o roteiro em modo teste |
| F3 — Correções críticas | ✅ concluída na branch `fase-3-correcoes-criticas` (aguardando revisão) |
| F2 — Dependências | ✅ concluída na branch `fase-2-dependencias` (aguardando revisão) |
| F1 — Banco local | ✅ implementada na branch `fase-1-banco-local` (aguardando revisão); falta só o teste manual de login/onboarding pela UI |
| Próxima fase | ▶️ **F5 (fechar pendências de contas)** ou **F6 — Notificações e integrações** |

**Mudanças no plano desde a primeira versão:**
- A "Ação imediata" foi concluída: o backup existe, então a importação de dados na F1 deixou de ser hipotética e ganhou um procedimento concreto (restaurar o dump em **dev**; produção começa com banco limpo).
- F0 ganhou a tarefa de resolver o conflito de porta com o PostgreSQL nativo instalado pelo winget (Postgres do Docker de dev vai para a porta **5433**).
- F1: connection string de dev passa a usar a porta 5433.
- F7/F10: a senha do banco do Supabase foi resetada durante o backup e o arquivo de backup contém dados pessoais — entraram tarefas de cópia externa do backup e de exclusão do projeto Supabase depois da validação.
- Decisão D1 atualizada (§6).

---

## Sumário

0. [Status rápido (leia primeiro)](#0-status-rápido-leia-primeiro)
1. [Diagnóstico — onde o projeto está](#1-diagnóstico--onde-o-projeto-está)
2. [Achados críticos (bugs e riscos encontrados no código)](#2-achados-críticos)
3. [Arquitetura alvo — hospedagem no próprio PC](#3-arquitetura-alvo--hospedagem-no-próprio-pc)
4. [Atualização da stack (mantendo a mesma stack)](#4-atualização-da-stack)
5. [Fases de execução (F0 → F10)](#5-fases-de-execução)
6. [Decisões pendentes do dono 🧑](#6-decisões-pendentes-do-dono-)
7. [Pós-lançamento (fora do escopo do MVP)](#7-pós-lançamento)
8. [Apêndice — mapa de arquivos e comandos](#8-apêndice)
9. [Registro de execução](#9-registro-de-execução)

---

## 1. Diagnóstico — onde o projeto está

### 1.1 Stack atual (confirmada no código)

| Camada | Tecnologia | Versão no repo |
|---|---|---|
| Frontend | Next.js (App Router, RSC, BFF em Route Handlers), React, TS strict, Tailwind v4, Radix/shadcn, RHF + Zod, motion, recharts | Next **16.2.1**, React **19.2.4** |
| Backend | ASP.NET Core .NET 10, Clean Architecture (Api / Application / Domain / Infrastructure), EF Core + Npgsql, Hangfire (Postgres), JWT em cookie HttpOnly | .NET **10.0.0** (pacotes 10.0.0) |
| Banco | PostgreSQL — hospedado no **Supabase** (só como Postgres gerenciado) | — |
| Pagamentos | Stripe Billing (assinaturas) + Stripe Connect Express (split cartão) + Mercado Pago (PIX) | Stripe.net 51.1.0 |
| Notificações | Resend (e-mail), Evolution API (WhatsApp) — ambos com fallback "log" quando sem chave | — |
| Deploy anterior | Frontend na Vercel, backend no Render (Docker), banco no Supabase | — |

**Boa notícia sobre o Supabase:** o projeto **não usa nenhum recurso específico do Supabase** (nem Auth,
nem Storage, nem Realtime, nem RLS). O Supabase era só um Postgres. Todo o schema está nas migrations
do EF Core (`backend/src/MarcaAi.Infrastructure/Migrations/`) e é aplicado no boot
(`db.Database.Migrate()` em `Program.cs`). Ou seja: **trocar para um Postgres local é trivial** — sobe o
Postgres, aponta a connection string, a API cria todas as tabelas sozinha.

### 1.2 O que já está pronto (≈ 75–80% do MVP)

- **Auth:** magic link + Google OAuth, JWT access (15 min) + refresh (30 dias) em cookies HttpOnly, CSRF por antiforgery, BFF que re-emite cookies first-party.
- **Onboarding** com perfil de saúde, agenda padrão seg–sex 09–18 provisionada no cadastro.
- **Agenda:** disponibilidade semanal, exceções (bloqueio/férias/override), buffers, cálculo de slots puro em `Application/Scheduling`, fusos IANA, anti double-booking com `SELECT … FOR UPDATE SKIP LOCKED`.
- **Google Calendar:** FreeBusy + criação de evento com Meet (best-effort).
- **Tipos de consulta:** CRUD completo.
- **Clínicas/equipes:** CRUD, convite/remoção de membros, RBAC OWNER/ADMIN/MEMBER.
- **Planos (4):** `SOLO` (grátis, 10%), `SOLO_PRO` (R$49, 5%), `CLINICA` (R$129, 2,49%), `CLINICA_PRO` (R$199, 1,99%) — `PlanCatalog.cs` (back) espelhando `plan-config.ts` (front); enforcement de `custom_branding` e `whatsapp_reminders`.
- **Billing:** checkout Stripe individual (`/user/billing`) e de clínica (`/teams/{id}/billing`), webhook roteando por metadata.
- **Recebimentos:** Stripe Connect Express (onboarding/KYC, `account.updated`, `payment_intent.succeeded`), erros 502/503 já tipados.
- **Financeiro:** `FinanceController` com `/finance/summary` e `/finance/teams/{id}/summary` (dados reais; mocks do front já viraram "tombstones").
- **Lembretes:** Hangfire a cada 15 min (e-mail + WhatsApp por plano).
- **UI:** Design System Teal healthtech consolidado (ADR-0006), skeletons, empty states, mobile-first, A11y AA.
- **Os 3 bugs do `docs/recovery-spec.md` já foram corrigidos** (intenção de plano via `state` do OAuth, item "Planos e assinatura" no menu, erros do Connect propagados).

### 1.3 O que falta (resumo — detalhado nas fases)

- 🔴 **O fluxo público de agendamento está quebrado** (ver §2, achado #1) — é o core do produto.
- 🔴 Falha de segurança IDOR em `DELETE /payouts/{id}` (achado #2).
- Infra: sair de Supabase/Vercel/Render → Docker Compose no PC + Cloudflare Tunnel + backups.
- Endpoints de backend do backlog ainda não implementados (troca de papel, confirmação manual, perfil completo, detalhe de tipo de consulta com perguntas, página pública da clínica, extrato financeiro).
- Trial de 30 dias prometido na landing **não é provisionado no servidor** (só existe se vier do Stripe).
- Hardening de produção: rate limiting, validação de config no boot, Hangfire dashboard, logs com PII, páginas legais LGPD.
- Testes: **zero testes no backend**; frontend tem só 12 testes unitários + 5 e2e.
- Dependências: Node 20 (já EOL), patches de segurança do Next.js (houve releases de segurança em jul/ago/set/out/nov 2026), patches do .NET 10.

---

## 2. Achados críticos

Itens encontrados lendo o código. Cada um vira tarefa numa fase.

| # | Severidade | Achado | Onde | Fase |
|---|---|---|---|---|
| 1 | 🔴 Bloqueante | **Agendamento público não funciona.** A página `/[username]/[slug]` passa `owner.id = profile.id ?? ""`, mas o `PublicProfileDto` do backend **não tem `Id`**. Resultado: `ownerId` vazio → `GET /slots` retorna 400 → paciente não vê horários nem consegue agendar. | `frontend/app/(public)/[username]/[slug]/page.tsx:62`, `backend/src/MarcaAi.Application/Features/Public/PublicDtos.cs`, `PublicController.cs` | F3 |
| 2 | 🔴 Segurança | **IDOR:** `DELETE /api/v1/payouts/{id}` desconecta qualquer conta de recebimento de qualquer usuário (há um `TODO (RBAC)` no código). | `backend/src/MarcaAi.Api/Controllers/PayoutsController.cs:114` | F3 |
| 3 | 🔴 Segurança | **Magic link vaza no log em produção** se `Resend:ApiKey` estiver ausente — a DI cai no `LoggingMagicLinkSender` silenciosamente; qualquer um com acesso ao log entra em qualquer conta. | `Infrastructure/DependencyInjection.cs` | F3 |
| 4 | 🟠 Segurança | Dashboard do Hangfire em `/hangfire` sem autorização explícita (comentário diz "proteger em produção"). | `Program.cs` | F3 |
| 5 | 🟠 Segurança | Nenhum rate limiting: `POST /auth/magic-link/request` (spam de e-mail), `POST /bookings` (spam de agendamentos), `GET /slots`. | `Program.cs` | F7 |
| 6 | 🟠 Bug | `package.json` → bloco `overrides` **corrompido** (`"date-fns": "-fns"`, `"react": ""`, `"react-dom": "-dom"`) — os `$date-fns`/`$react` foram comidos por expansão de shell. | `frontend/package.json` | F0 |
| 7 | 🟠 Bug | `frontend/.env` está desatualizado (ainda tem `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_*`, `CRON_SECRET` da era Prisma/NextAuth); o README fala de um `docker-compose.yml` que **não existe**. | `frontend/.env`, `backend/README.md` | F0 |
| 8 | 🟠 Config | Pool de conexões travado para o pooler do Supabase (`MaxPoolSize = 5` na API, `3` + 3 workers no Hangfire). Num Postgres local isso só limita desempenho. | `Infrastructure/DependencyInjection.cs`, `Program.cs` | F1 |
| 9 | 🟠 Produto | Trial de 30 dias anunciado na landing/TeamForm, mas `POST /teams` não grava trial; `PlanAccessService` só reconhece `trialing` vindo do Stripe. | `TeamsController.cs`, `PlanAccessService.cs`, `StripeBillingService.cs` | F4 |
| 10 | 🟡 Produto | Grade de slots fixa em 30 min (`TODO` em `TimeUtils.cs:73`) — consulta de 50 min gera horários estranhos. | `Application/Scheduling/TimeUtils.cs` | F4 |
| 11 | 🟡 Produto | Split PIX via Mercado Pago incompleto (`TODO` buscar access token do vendedor; desconexão não revoga tokens). Webhook do MP não valida `x-signature` (mitigado porque re-consulta o pagamento na API do MP). | `MercadoPagoSplitService.cs:129`, `PayoutAccountService.cs:135`, `MercadoPagoWebhookController.cs` | F5 |
| 12 | 🟡 Config | `next.config.ts` tem `typescript.ignoreBuildErrors: true` (gambiarra para OOM da Vercel Hobby) — sem Vercel, não precisa mais. | `frontend/next.config.ts` | F2 |
| 13 | 🟡 Repo | `.gitignore` da raiz ignora `/docs/` mas o README e `future-phases-spec.md` dizem que docs são versionados — specs/ADRs só existem na sua máquina (risco de perda). | `.gitignore` | F0 🧑 |
| 14 | 🟡 CI | CI só builda o frontend (Node 20, EOL); `NEXT_PUBLIC_API_URL` na CI inclui `/api/v1` (o código espera **sem**). Não há job do backend. | `.github/workflows/ci.yml` | F8 |
| 15 | 🟡 OAuth | O login com Google pede escopos de **Calendar** (sensíveis) já no login, com `prompt=consent`. Em produção isso exige **verificação do app no Google**; enquanto o app estiver em modo "Testing", só 100 usuários de teste e os refresh tokens **expiram em 7 dias**. | `Program.cs` (AddGoogle) | F6 |

| 16 | 🟠 Segurança/LGPD | **`GET /bookings/{uid}` e `POST /bookings/{uid}/cancel` são anônimos** e o `Uid` é um CUID v1 (timestamp + contador: parcialmente previsível). Quem adivinhar o uid vê nome/e-mail do paciente e pode cancelar. | `BookingsController.cs` (GetByUid/Cancel), `ApplicationDbContext.cs:274-286` | F7 (propor: uid aleatório de 128 bits para novos bookings + não retornar e-mail completo) |
| 17 | 🟠 Segurança | **Antiforgery configurado mas nunca validado**: não há `[ValidateAntiForgeryToken]`/`UseAntiforgery`; a única defesa CSRF real é `SameSite=Lax` (o comentário em `AuthSessionWriter` diz o contrário). | `Program.cs` (AddAntiforgery), `AuthSessionWriter.cs:38` | F7 |

---

## 3. Arquitetura alvo — hospedagem no próprio PC

### 3.1 Visão geral

```
                Internet
                   │
        ┌──────────▼───────────┐
        │  Cloudflare (DNS+TLS) │   app.SEUDOMINIO.com.br → web:3000
        │  Cloudflare Tunnel    │   api.SEUDOMINIO.com.br → api:8080
        └──────────┬───────────┘   (sem abrir portas no roteador; funciona atrás de CGNAT)
                   │ (conexão de saída do cloudflared)
   ┌───────────────▼─────────────────────────── Seu PC (Windows + Docker Desktop/WSL2) ─┐
   │  docker compose (rede interna "marcaai")                                          │
   │                                                                                   │
   │  ┌────────────┐   ┌──────────────┐  server-to-server   ┌──────────────┐          │
   │  │ cloudflared│──▶│ web (Next 16 │────────────────────▶│ api (.NET 10)│          │
   │  └────────────┘   │  standalone) │  http://api:8080    │  + Hangfire  │          │
   │        │          └──────────────┘                     └──────┬───────┘          │
   │        └───────────────────────────────────────────────────▶ │ (webhooks,       │
   │                                                              │  OAuth callback)  │
   │                    ┌────────────────┐                ┌───────▼───────┐           │
   │                    │ backup (cron   │──pg_dump──────▶│ postgres:18   │           │
   │                    │ pg_dump+rclone)│                │ volume local  │           │
   │                    └───────┬────────┘                └───────────────┘           │
   │                            │  (opcional) evolution-api (WhatsApp)                 │
   └────────────────────────────┼──────────────────────────────────────────────────────┘
                                ▼
                 Backup criptografado fora do PC (Cloudflare R2 / Backblaze B2 / Google Drive)
```

### 3.2 Por que essas escolhas

- **Docker Compose:** mantém a stack igual (o backend já tem `Dockerfile`), roda igual em dev e prod, e o dia que você quiser sair do PC para uma VPS é só copiar o `compose` + `.env` + restaurar o backup.
- **Cloudflare Tunnel (grátis):** expõe HTTPS sem abrir porta no roteador, sem IP fixo e funcionando atrás de **CGNAT** (comum em internet residencial no Brasil). Exige que o DNS do domínio esteja na Cloudflare (dá para registrar o `.com.br` no registro.br e apontar os nameservers para a Cloudflare).
- **Dois subdomínios no mesmo domínio** (`app.` e `api.`): ficam *same-site*, o que simplifica cookies `SameSite=Lax`, CORS e o callback do Google. A API só precisa ser pública por causa do **callback do Google OAuth** e dos **webhooks** (Stripe/Mercado Pago) — todo o resto o Next chama por dentro da rede Docker.
- **Postgres 18 local** com volume persistente + **backup diário criptografado fora do PC** (dado de saúde = dado sensível na LGPD, art. 11; perder o banco seria fatal).

### 3.3 Riscos de hospedar em casa (honestidade)

| Risco | Mitigação |
|---|---|
| Queda de energia/internet = sistema fora do ar | Nobreak; monitor externo (UptimeRobot/Better Stack/Healthchecks.io grátis) avisando no celular; comunicar "beta". |
| Windows Update reinicia o PC | Horário ativo configurado; Docker Desktop iniciando no login + login automático (ou Docker Engine dentro do WSL2 como serviço); `restart: unless-stopped` em todos os containers. |
| Disco morre / ransomware | Backup diário criptografado **fora do PC** + teste de restauração mensal; BitLocker no disco. |
| Dado de saúde em máquina pessoal | Usuário dedicado no Windows, BitLocker, senha forte, nada de compartilhar a máquina; plano de migração para VPS quando houver clientes pagantes. |

**Recomendação:** lançar em casa como beta/primeiros clientes; manter tudo portátil (compose + backups) para migrar para uma VPS brasileira quando a receita justificar.

---

## 4. Atualização da stack

**Regra:** manter a mesma stack, subindo para as versões mais recentes **estáveis**. Patches/minors: atualizar livremente. Majors: só os listados como "recomendado", com teste.

> O Claude Code deve **consultar a versão mais recente na hora da execução** (`npm view <pkg> version`,
> `dotnet list package --outdated`) em vez de confiar nos números abaixo, que são de 06/11/2026.

| Componente | Atual | Alvo | Observação |
|---|---|---|---|
| Node.js | 20 (EOL desde abr/2026) | **24 LTS** | Atualizar CI, `@types/node`, Dockerfile do front, `engines` no package.json. |
| Next.js / eslint-config-next | 16.2.1 | **último 16.x** (16.4.x+, incluindo a security release de 03/11/2026) | Houve várias security releases em 2026 — prioridade alta. |
| React / React DOM | 19.2.4 | último 19.2.x | — |
| Tailwind / @tailwindcss/postcss | 4.2.x | último 4.x | — |
| Radix, zod, RHF, date-fns, sonner, vaul, cmdk, motion, lucide-react | vários | últimos minors | `lucide-react` pode ter renomeado ícones — checar build. |
| react-day-picker | 8.10.1 (exige override hack) | **9.x** (recomendado) | Remove a necessidade do `overrides`; ajustar `components/ui/calendar.tsx` (API mudou). |
| @stripe/stripe-js / @stripe/react-stripe-js | 4.x / 2.x | majors atuais | Testar o `stripe-panel.tsx` (Elements) após subir. |
| recharts | 2.15.2 | **manter 2.x** | v3 quebra o `chart.tsx` do shadcn; deixar para pós-lançamento. |
| vitest / playwright / typescript | 4.x / 1.59 / 5.x | últimos | — |
| .NET SDK/runtime | 10.0.0 | **último 10.0.x** (LTS, suporte até nov/2028) | **Não** migrar para .NET 11 (STS) agora. |
| EF Core / Npgsql / Npgsql.EFCore.PG | 10.0.0 | último 10.0.x | — |
| ASP.NET (JwtBearer, Google, OpenApi) | 10.0.0 | último 10.0.x | — |
| Hangfire.AspNetCore / Hangfire.PostgreSql | 1.8.14 / 1.20.10 | últimos 1.8.x / 1.2x | — |
| Stripe.net | 51.1.0 | último major | ⚠️ Cada major do Stripe.net fixa uma *API version*: o endpoint de webhook no dashboard do Stripe precisa usar a mesma versão. Testar checkout + Connect + webhooks depois. |
| System.IdentityModel.Tokens.Jwt | 8.18.0 | último 8.x | — |
| PostgreSQL | (Supabase, 15/17) | **18** (imagem `postgres:18-alpine`) | ⚠️ Na imagem oficial 18 o volume deve ser montado em `/var/lib/postgresql` (não mais `/var/lib/postgresql/data`). |

---

## 5. Fases de execução

> Convenções para todas as fases:
> - Trabalhar numa branch por fase: `git checkout -b fase-N-nome` a partir da `main` atualizada.
> - Commits pequenos e descritivos (padrão do repo: `feat:`, `fix:`, `refactor:`, `chore:`).
> - Verificação mínima ao fim de cada fase: `./build.sh` verde (ou o equivalente no PowerShell) + testes da fase.
> - O usuário está no **Windows** (`C:\Code\marcaAi`). Preferir comandos que funcionem em PowerShell e em Git Bash; scripts operacionais em `.ps1` **e** `.sh` quando fizer sentido.
> - **Pare a API antes de `dotnet build`/migrations** (o Windows trava DLLs em uso — já documentado no README do backend).

---

### 5.0 Conformidade LGPD contínua (transversal — vale para TODAS as fases)

MarcaAí trata **dado de saúde (dado sensível, LGPD art. 11)** de pacientes. A conformidade não é uma fase única (F7): é um **gate em cada fase**, apoiado nas Agent Skills de [goul4rt/lgpd-skills](https://github.com/goul4rt/lgpd-skills) (MIT; LGPD, resoluções ANPD 2/2022, 4/2023, 15/2024, 18/2024, 19/2024 e ECA Digital).

**Instalação (🧑 D12 — só após seu ok; é código/instruções de terceiros, então revisar o repo antes):**
```
/plugin marketplace add goul4rt/lgpd-skills
/plugin install lgpd-skills@lgpd-skills
```
Alternativa mais controlada: clonar, revisar e copiar `skills/lgpd-*` para `.claude/skills/` do projeto (fixa a versão no repo).

**Regras de uso:**
- Os artefatos das skills ficam em **`.lgpd/`** na raiz (`STATUS.md`, `data-map.md`, `legal-basis.md`, `ROPA.md`, `RIPD/`, `dsar/`, `incidents/`, `vendors/`, `transfers/`, `policies/`, `encarregado.md`, `gaps.md`…), **versionados no git e revisados em PR**. Jamais colocar dados pessoais reais ali (só descrições).
- As skills assumem Next.js + Prisma + Better Auth; o MarcaAí é **Next.js + .NET/EF Core + JWT próprio**. Usar o que é agnóstico (inventário, base legal, ROPA, RIPD, política, DPA, resposta a incidentes, retenção) e **adaptar** o que é específico de stack (consent ledger, audit log, DSAR) para C#/EF Core, seguindo as convenções do repo.
- **Não substitui advogado/DPO** (disclaimer do próprio repo): texto de política, termos, DPA, cláusulas e decisão de notificar a ANPD passam por revisão jurídica (🧑).
- Pipeline de partida: **C (híbrido)** — código existente + funcionalidades novas. Primeiro passo: `lgpd-audit` para gerar `.lgpd/STATUS.md` e `gaps.md` de linha de base.
- A cada fase: rodar o gate, atualizar `.lgpd/STATUS.md`, registrar lacunas novas em `gaps.md` e citar o resultado no relatório de fim de fase.

**Gates LGPD por fase:**

| Fase | Gate (skills) |
|---|---|
| F0/F1 | Instalar skills (D12); `lgpd-audit` de linha de base; `lgpd-data-mapping` (inventário real das tabelas — `users`, `bookings`, `booking_responses`, etc.). Importar o dump do Supabase em **dev** é tratamento de dado pessoal real: base legal/finalidade registradas, dump fora do repo, banco de dev não exposto, e descartar o dado quando não for mais necessário (`lgpd-retention-erasure`). |
| F2 | Nenhum dado novo; revisar `npm audit`/CVEs como medida de segurança (art. 46). |
| F3 | Remoção de PII dos logs (`lgpd-audit-logging`); correção do IDOR e do magic link = controles de segurança art. 46; `lgpd-legal-basis` para o formulário público de agendamento. |
| F4 | `lgpd-consent-schema` (consentimento no booking); `lgpd-dsar` (exportar/excluir paciente e conta — endpoints do art. 18); `lgpd-retention-erasure` (política + job); `lgpd-anonymization` onde couber; novo campo (`specialty`, `registrationNumber`…) entra no `data-map`. |
| F5 | `lgpd-vendor-audit` + `lgpd-dpa` para **Stripe** e **Mercado Pago**; `lgpd-international-transfer` (Stripe/US); revisar minimização do que é enviado aos provedores. |
| F6 | `lgpd-vendor-audit`/`lgpd-dpa`/`lgpd-international-transfer` para **Resend, Google (OAuth/Calendar), Cloudflare, Evolution/WhatsApp**; revisar escopos OAuth mínimos; e-mails sem dado de saúde no corpo. |
| F7 | Executa o grosso: `lgpd-legal-basis`, `lgpd-ropa`, `lgpd-ripd` (dado sensível de saúde → RIPD obrigatoriamente), `lgpd-privacy-policy`, `lgpd-dpo-encarregado`, `lgpd-encryption-keys`, `lgpd-incident-response`, `lgpd-eca-digital-minors` (avaliar se pacientes menores se aplicam). |
| F8 | Testes automatizados cobrindo DSAR (exportar/excluir), consentimento gravado e anonimização. |
| F9 | Backup criptografado (`lgpd-encryption-keys`), BitLocker, controle de acesso ao PC; runbook inclui o **plano de resposta a incidentes** (prazo de 3 dias úteis — Res. 15/2024) e teste de mesa; Cloudflare/R2 no inventário de operadores. |
| F10 | **Go/no-go LGPD:** `.lgpd/STATUS.md` sem pendência crítica, ROPA/RIPD/política/DPA revisados por advogado, encarregado designado e divulgado, canal do titular funcionando. Sem isso, não abrir para pacientes reais. |

---

### ⚡ Ação imediata (antes da F0) — dados do Supabase ✅ CONCLUÍDA em 06/11/2026

O projeto do Supabase foi reativado pelo dono e o banco foi exportado com `pg_dump`.

- [x] Projeto Supabase reativado (dentro da janela de 90 dias).
- [x] Backup do banco gerado e **validado** (`pg_restore -l` listou os `TABLE DATA` de `users`, `bookings`, `event_types`, `teams`, `__ef_migrations_history` etc.).
- [ ] 🧑 Copiar o arquivo de backup para um local fora do PC (Google Drive/pen drive) — contém dados pessoais, **nunca** no repositório.

**Detalhes do backup (referência para a F1):**

| Campo | Valor |
|---|---|
| Arquivo | `C:\Code\marcaAi-backup\marcaai-supabase.dump` (fora do repo) |
| Formato | custom do `pg_dump` (`-Fc`) — restaurar com `pg_restore`, não com `psql` |
| Escopo | só o schema `public` (`-n public`) — tabelas do MarcaAí, enums nativos e `__ef_migrations_history`; **sem** os schemas internos do Supabase e **sem** o schema do Hangfire |
| Opções | `--no-owner --no-privileges` (restaura em qualquer usuário) |
| Gerado com | `pg_dump` 18 (imagem `postgres:18-alpine`) via **Session pooler** IPv4 (`aws-0-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`) — a conexão direta `db.<ref>.supabase.co` é só IPv6 e falha no Docker do Windows |

Comando usado (para repetir se precisar; senha só na variável, nunca em arquivo):

```powershell
$senha = '...'
docker run --rm -e PGPASSWORD=$senha -v C:\Code\marcaAi-backup:/backup postgres:18-alpine `
  pg_dump -h aws-0-sa-east-1.pooler.supabase.com -p 5432 -U postgres.txxnvkyckikjfouycbzx -d postgres `
  -n public --no-owner --no-privileges -Fc -f /backup/marcaai-supabase.dump
```

> O Supabase volta a pausar após ~7 dias sem uso. Isso não é mais um problema: o backup já existe.
> O projeto Supabase só deve ser **excluído** na F10, depois que a importação em dev (F1) for validada.

---

### F0 — Higiene do repositório e ambiente de desenvolvimento

**Objetivo:** repositório limpo, reproduzível e com contexto para o Claude Code.

- [x] Criar `CLAUDE.md` na raiz com: visão do produto, stack, estrutura do monorepo, convenções (§2 do `docs/future-phases-spec.md`: endpoints só via `endpoints.ts`, RHF+Zod, tokens do DS, nada de cor fora da paleta, `ApiError`), comandos de build/test, e "leia `PLANO_DE_LANCAMENTO.md`".
- [x] 🧑 Resolver o `.gitignore` x `/docs/` (achado #13). **Recomendado:** versionar `docs/` (remover a regra `/docs/`), revisando antes se não há segredo nos `.md`.
- [x] Corrigir o bloco `overrides` do `frontend/package.json` (achado #6). Se a F2 for migrar `react-day-picker` para v9, o bloco pode ser removido; senão, corrigir para `"$date-fns"`, `"$react"`, `"$react-dom"`.
- [x] Reescrever `frontend/.env` a partir do `.env.example` (só `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — remover variáveis mortas da era Prisma/NextAuth (achado #7).
- [ ] **Conflito de porta com o PostgreSQL nativo:** durante o backup o dono instalou o PostgreSQL 17 via winget, que costuma criar um serviço do Windows ouvindo na **5432**. Verificar com `Get-Service postgresql*` e `Get-NetTCPConnection -LocalPort 5432 -State Listen`. 🧑 Recomendado: **manter** o PostgreSQL nativo só pelas ferramentas de linha de comando (`pg_dump`/`psql`/`pg_restore` em `C:\Program Files\PostgreSQL\17\bin`), mudar o serviço para início **Manual** e pará-lo (`Stop-Service postgresql-x64-17; Set-Service postgresql-x64-17 -StartupType Manual`, em PowerShell como administrador) — e, por segurança, publicar o Postgres do Docker de dev na porta **5433** do host de qualquer forma. — **pendente do dono (admin):** o serviço `postgresql-x64-17` continua Running/Automatic na 5432; o Postgres do compose já usa a 5433 e não conflita.
- [x] Criar `docker-compose.dev.yml` na raiz com **Postgres 18** (`postgres:18-alpine`, porta do host **5433** → 5432 do container, volume nomeado montado em `/var/lib/postgresql`, usuário/senha/banco `marcaai`) e **Mailpit** (SMTP fake em :1025 + UI web em :8025) para dev. Atualizar README e `backend/README.md` (hoje citam um compose inexistente e a porta 5432).
- [x] Criar `.env.example` na raiz (variáveis do compose) e `backend/.env.example` (todas as chaves do `appsettings.json` no formato de variável de ambiente `Secao__Chave`, ex.: `ConnectionStrings__Default`, `Jwt__SigningKey`, `Stripe__SecretKey`).
- [x] Adicionar `global.json` no backend fixando o SDK 10.0.x (`rollForward: latestPatch`).
- [x] Adicionar `"engines": { "node": ">=24" }` e `.nvmrc` no frontend.
- [x] Remover artefatos que não fazem mais sentido: `frontend/vercel.json` (crons vazio) — 🧑 confirmar que não vai mais usar Vercel.

**Aceite (verificado em 06/11/2026, exceto o item de porta pendente):** `docker compose -f docker-compose.dev.yml up -d` sobe Postgres + Mailpit; README descreve o setup real; `git status` limpo depois do commit.

---

### F1 — Banco local (sair do Supabase)

**Objetivo:** API rodando contra Postgres local, sem nenhuma dependência do Supabase.

- [x] Tornar o pool configurável (achado #8): ler `Database:MaxPoolSize` (default 20) e `Hangfire:WorkerCount` (default 5) / `Hangfire:MaxPoolSize` (default 5) da config, em vez dos valores fixos para o pooler do Supabase. Atualizar os comentários.
- [x] `appsettings.Development.json`: connection string apontando para o Postgres do compose (`Host=localhost;Port=5433;Database=marcaai;Username=marcaai;Password=marcaai`), sem SSL. Conferir se existe um `user-secrets` antigo com a connection string do Supabase (`dotnet user-secrets list --project src/MarcaAi.Api`) — se existir, **remover** essa chave, senão ela sobrescreve o appsettings e a API continua tentando o Supabase. Documentar o uso de `dotnet user-secrets` para sobrescrever.
- [x] Subir a API (`dotnet run --project src/MarcaAi.Api`) e confirmar que `Migrate()` cria todas as tabelas, os enums nativos e o schema do Hangfire. Conferir `GET /health`.
- [x] Rodar `dotnet ef migrations add Check_Sync --project src/MarcaAi.Infrastructure --startup-project src/MarcaAi.Api` e confirmar que a migration gerada é **vazia** (modelo == snapshot); depois removê-la (`dotnet ef migrations remove`).
- [x] 🧑 **Importar o backup do Supabase no banco de dev** (recomendado: sim, em dev — dá dados reais de teste e valida as migrations; **produção começa com banco limpo**, sem dados de teste). Criar `scripts/import-supabase-backup.ps1` (+ `.sh`) que:
  1. Para a API; recria o banco `marcaai` **vazio** no Postgres do compose (`DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE`).
  2. Restaura o dump completo (schema + dados) usando o próprio container do compose, montando `C:\Code\marcaAi-backup` como volume somente leitura: `pg_restore --no-owner --no-privileges -d marcaai /backup/marcaai-supabase.dump`. Erros como "schema public already exists" são esperados e inofensivos; qualquer outro erro → parar e reportar.
  3. Como o dump traz a tabela `__ef_migrations_history`, ao subir a API o `Migrate()` só aplica as migrations que ainda faltarem (ex.: `AddUserBilling`, se o Supabase estava atrasado). O schema do Hangfire é criado sozinho pela API.
  4. Roda `backend/scripts/normalize_plan_codes.sql` (idempotente).
  5. Mostra a contagem de linhas por tabela para conferência.
  - **Plano B** se a restauração completa conflitar com as migrations: subir a API num banco vazio (migrations criam o schema) e depois `pg_restore --data-only --disable-triggers --exclude-table=__ef_migrations_history` (ou `-L` com lista filtrada).
  - O caminho do backup deve vir de parâmetro/variável (`BACKUP_PATH`, default `C:\Code\marcaAi-backup\marcaai-supabase.dump`) — nunca copiar o dump para dentro do repo.
- [x] Se não importar: `normalize_plan_codes.sql` não é necessário (banco novo já nasce com os códigos de plano novos).
- [ ] Seed de desenvolvimento (opcional, recomendado): endpoint/comando só em `Development` ou script SQL criando 1 profissional onboarded, 2 tipos de consulta e 1 clínica — acelera os testes manuais e e2e. — **não feito** (o dump importado já dá dados de teste; reavaliar na F8).

**Aceite:** front (`npm run dev`) + API locais funcionando: login por magic link (link aparece no log em dev ou no Mailpit), onboarding, criar tipo de consulta, ver dashboard.

---

### F2 — Atualização de dependências

**Objetivo:** stack nas versões mais recentes estáveis (tabela da §4), sem regressão.

Backend:
- [x] `dotnet list package --outdated` → subir todos os pacotes 10.0.x para o último patch; Hangfire; JWT.
- [x] Stripe.net para o último major: ler o changelog de breaking changes, ajustar `StripeBillingService`, `StripeConnectService`, `StripeWebhookController`; anotar a API version nova (vai para o dashboard do Stripe na F5).
- [x] `Dockerfile` do backend: porta padrão **8080** (`ASPNETCORE_HTTP_PORTS=8080`) em vez da 10000 do Render; rodar como usuário não-root (`USER app`, já existe nas imagens .NET 8+).

Frontend:
- [x] Node 24 LTS local; `npm install` limpo (apagar `node_modules` e regenerar `package-lock.json`).
- [x] `next`, `eslint-config-next`, `react`, `react-dom` → últimas 16.x / 19.2.x.
- [x] Demais deps para os últimos minors (`npx npm-check-updates --target minor -u`), depois majors recomendados: `react-day-picker` 9 (ajustar `components/ui/calendar.tsx` e remover `overrides`), `@stripe/*`, `@types/node` 24.
- [x] `next.config.ts`: remover `typescript.ignoreBuildErrors: true` (achado #12) e adicionar `output: "standalone"` (necessário para a imagem Docker da F9).
- [x] Testar se o `next dev`/`next build` funcionam com **Turbopack** (padrão do Next 16); se sim, remover a flag `--webpack` dos scripts; se não, manter e registrar o motivo.
- [x] `npm audit` sem vulnerabilidades high/critical.

**Aceite (verificado 06/11/2026; e2e Playwright não executado):** `./build.sh` verde (com `tsc --noEmit` sem ignorar erros), `npm run test` verde, app funcionando localmente nos fluxos da F1.

---

### F3 — Correções críticas (bloqueadores e segurança)

**Objetivo:** consertar o que impede o lançamento ou expõe dados.

- [x] **#1 Agendamento público:** adicionar `Id` ao `PublicProfileDto` e ao `PublicController` (expor apenas o id do profissional — nada de e-mail). Adicionar também, por tipo de consulta: `requiresConfirm`, `bookingLimitDays`, buffers (gap do backlog "Fase 2"). Ajustar `frontend/lib/api/types.ts`. Testar ponta a ponta: perfil público → escolher serviço → ver slots → agendar → página `/booking/[uid]`.
- [x] **#2 IDOR em payouts:** `DELETE /payouts/{id}` só pode desconectar conta do próprio usuário (`ownerType=USER, ownerId=userId`) ou de clínica onde o usuário é OWNER/ADMIN. Retornar 404 (não 403) para conta alheia. Revisar os outros endpoints de payouts/finance/teams procurando o mesmo padrão.
- [x] **#3 Magic link em produção:** em `Production`, se `Resend:ApiKey` estiver vazio → **falhar no boot** com mensagem clara (nunca cair no `LoggingMagicLinkSender`). Criar uma validação de configuração no startup (`IValidateOptions` ou checagem em `Program.cs`) que, fora de `Development`, exige: `ConnectionStrings:Default`, `Jwt:SigningKey` (≥ 32 bytes e diferente do valor de dev), `App:PublicUrl` https, `Cors:FrontendOrigin`, `Resend:ApiKey`. Stripe/MP/WhatsApp/Google continuam opcionais (com log de aviso).
- [x] **#4 Hangfire dashboard:** em produção, desabilitar ou proteger com um `IDashboardAuthorizationFilter` (ex.: usuário autenticado com claim/e-mail de admin definido em config). Nunca deixar público.
- [x] **Remover logs de PII:** revisar `LogInformation`/`LogWarning` que imprimem e-mail, telefone, nome de paciente ou corpo de webhook (checklist do `docs/healthtech-pivot-checklist.md` §6). Logar ids, não dados pessoais.
- [x] **URL interna da API no front:** criar a variável server-only `API_INTERNAL_URL` (ex.: `http://api:8080` dentro do Docker) usada pelo `serverApiFetch`/`rawApiFetch`/BFF; `NEXT_PUBLIC_API_URL` continua sendo a URL pública (usada no browser, ex.: botão "Entrar com Google"). Fallback: se `API_INTERNAL_URL` não existir, usa `NEXT_PUBLIC_API_URL`. Atualizar `lib/env.ts` e `lib/api/config.ts`.

**Aceite (verificado 06/11/2026 via API/curl com usuários de teste, depois removidos; fluxo pela UI do navegador não exercitado):** fluxo público de agendamento funcionando localmente; teste manual do IDOR retornando 404; API em `ASPNETCORE_ENVIRONMENT=Production` sem `Resend:ApiKey` não sobe; `/hangfire` bloqueado em produção.

---

### F4 — Completar os gaps de produto do backlog

**Objetivo:** fechar as funcionalidades que a UI já expõe mas o backend não atende (fonte: `docs/backend-backlog.md`, `docs/future-phases-spec.md` §4).

- [x] `PUT /teams/{id}/members/{userId}` — troca de papel MEMBER ⇄ ADMIN (regras: só OWNER/ADMIN; nunca o OWNER; nunca o próprio usuário; 409 ao tentar rebaixar o OWNER). O front já chama (`lib/actions/team.ts`).
- [x] `POST /bookings/{uid}/confirm` — aprovação manual de consulta `PENDING` (dono ou gestor da clínica); cria evento no Google (best-effort) e notifica o paciente. Reativar `approveBookingAction` em `app/(dashboard)/dashboard/bookings/actions.ts`.
- [x] `GET /me/profile` + estender `UpdateProfileInput`/`MeDto` com `specialty`, `council`, `registrationNumber`, `clinicName` (nova migration com colunas nullable). Trocar o pré-preenchimento do perfil, que hoje usa `/public/{username}`.
- [x] `GET /event-types/{id}` com o objeto completo (buffers, `bookingLimitDays`, `locationValue`, `questions`) + suporte a `questions` no `EventTypeInput`; `POST /bookings` aceitando `responses` (gravar em `BookingResponse`). Tipar `questions`/`pixData` em `components/booking/booking-form.tsx` (remover `any`).
- [x] 🧑 `GET /public/team/{slug}` + página `/team/[slug]` real (perfil da clínica + profissionais + link para agendar com cada um). Decidir se entra no MVP ou fica para depois (hoje é placeholder "em breve").
- [x] `GET /finance/statement?from&to&status&provider` (extrato por consulta, paginado) — contrato em `docs/backend-backlog.md`.
- [x] **Trial de 30 dias server-side (achado #9)** 🧑 — decidir a regra: (a) trial no Stripe (checkout com `trial_period_days=30`, exige cartão) **ou** (b) trial interno sem cartão (gravar `TrialEndsAt = now + 30d` ao criar clínica / ao escolher Solo Pro; `PlanAccessService` considera trial interno válido; job diário do Hangfire rebaixa quando expira). A landing promete "30 dias grátis" — o comportamento real precisa bater com a promessa.
- [x] **Grade de slots por duração (achado #10):** parametrizar o passo da grade (ex.: igual à duração da consulta, ou configurável por tipo de consulta com default 30 min). Cobrir com teste unitário.
- [x] 🧑 **Cancelamento de consulta paga:** definir política (reembolso total até X horas antes? nenhum?) e implementar o reembolso via provedor (`StripeConnectService`/`MercadoPagoSplitService` já têm código de refund) + atualizar `PaymentStatus`.

**Aceite (verificado 06/11/2026 por script de integração via API: 40/40 verificações; telas não exercitadas no navegador):** nenhuma ação da UI retorna "em breve"/"endpoint pendente"; matriz do `docs/test-checklist.md` §6–7 passando para os itens já cobertos.

---


**Decisões do dono nesta fase:** D4 → implementar a página da clínica agora · D5 → trial interno sem cartão · D6 → reembolso total até 24h antes · LGPD → consentimento + exportar/excluir.
**Gate LGPD da F4 (§5.0):** feito o consentimento (`ConsentAt`/`ConsentVersion`) e o canal de exportar/anonimizar/excluir; retenção fica para a F7.

### F5 — Pagamentos ponta a ponta

**Objetivo:** dinheiro entrando e sendo repassado corretamente, com webhooks confiáveis.

- [x] 🧑 **Decidir os provedores do lançamento.** Recomendação: lançar com **um** caminho bem testado. Opções: (a) só Stripe (cartão; verificar se Pix via Stripe atende a sua conta BR + Connect), (b) Stripe para assinaturas + Mercado Pago para PIX de consultas (exige concluir o split do MP — achado #11 — e o OAuth de vendedor do MP). Se o MP ficar para depois, **esconder o PIX** na UI com flag de config em vez de deixar quebrado.
- [ ] 🧑 Pré-requisitos do dono: CNPJ, conta Stripe Brasil ativada, **Connect habilitado + perfil da plataforma completo** (pré-requisito do onboarding Express), produtos/preços recorrentes criados (Solo Pro, Clínica, Clínica Pro) e IDs em `Stripe:Prices:*`.
- [x] Idempotência de webhooks Stripe: tabela `processed_webhook_events (provider, eventId, processedAt)` com unique; ignorar repetidos. Responder 2xx rápido.
- [x] Mercado Pago (se for usar): validar `x-signature` do webhook; concluir `ResolveSellerAccessToken` (armazenar token do vendedor criptografado — Data Protection API do ASP.NET); revogar no disconnect.
- [ ] Rodar o roteiro de `docs/local-webhooks-setup.md` (Stripe CLI `stripe listen` para os 2 endpoints) e **todo o `docs/test-checklist.md`** em modo teste. Registrar o resultado.
- [x] Conferir que `platformFeeCents` gravado no `Booking` = `feeBps × preço` para cada plano (Solo 10%, Solo Pro 5%, Clínica 2,49%, Clínica Pro 1,99%).
- [x] Reconciliar `docs/specs/financial-split-spec.md` §4.3 com a tabela de preços vigente (hoje há divergência documental).

**Aceite:** checklist de pagamentos verde em modo teste; um pagamento real de R$ 1–5 em modo live (na F10) chega à conta conectada com a taxa correta.

---

**Decisão do dono (07/11/2026):** D7 → **Stripe + Mercado Pago PIX** (cartão e PIX no lançamento).
**Pendentes (dependem do dono, contas externas):** pré-requisitos Stripe (CNPJ, conta BR, Connect, preços recorrentes) e app do Mercado Pago (ClientId/ClientSecret/WebhookSecret); depois rodar `stripe listen` + `docs/test-checklist.md` em modo teste e o OAuth real do MP em sandbox.
**Gate LGPD da F5 (§5.0):** fichas de operador/transferência em `.lgpd/vendors/` e `.lgpd/transfers/` (rascunho); gaps G22/G23 abertos.

### F6 — Notificações e integrações

- [ ] **E-mail (Resend):** verificar o domínio no Resend (registros SPF/DKIM/DMARC na Cloudflare), remetente `MarcaAí <nao-responda@SEUDOMINIO>`; revisar templates (confirmação, cancelamento, lembrete, magic link) com a copy healthtech ("consulta", "paciente"). Em dev, usar o **Mailpit** do compose (adicionar um `SmtpEmailClient` para dev ou apontar o fallback de log).
- [ ] Magic link apontando para `{FRONT_URL}/auth/verify?token=...` (confirmar no `ResendMagicLinkSender`) e com expiração curta (≤ 15 min) + uso único.
- [ ] **WhatsApp (Evolution API):** 🧑 decidir se entra no MVP. A Evolution é uma API **não oficial** (risco de banimento do número). Se entrar: rodar no compose como serviço opcional (`profiles: [whatsapp]`), número dedicado, volume baixo. Alternativa oficial futura: WhatsApp Cloud API da Meta.
- [ ] **Google OAuth (achado #15):** separar **login** (escopos `openid email profile`, não sensíveis) de **"Conectar Google Agenda"** (fluxo à parte, pedido de dentro do dashboard, com os escopos de Calendar + `access_type=offline`). Isso permite publicar o app no Google sem esperar a verificação dos escopos sensíveis. Depois submeter a verificação para os escopos de Calendar.
- [ ] Callback de produção: `https://api.SEUDOMINIO.com.br/api/v1/auth/google/callback` cadastrado no Google Cloud Console.

**Aceite:** e-mails chegando na caixa de entrada (não spam) em produção; login Google funcionando para qualquer conta; conexão de agenda opcional.

---

### F7 — Segurança, LGPD e hardening

- [ ] **Rate limiting** (achado #5) com o `Microsoft.AspNetCore.RateLimiting` nativo: magic link (ex.: 5/hora por e-mail e 20/hora por IP), `POST /bookings` (por IP), `GET /slots`, `/auth/refresh`. Atrás do Cloudflare, usar o header `CF-Connecting-IP` para o IP real (configurar `ForwardedHeaders` corretamente — hoje `KnownNetworks/KnownProxies` estão limpos, aceitando qualquer proxy).
- [ ] **Headers de segurança** no Next: adicionar `Content-Security-Policy` (permitindo Stripe JS e o domínio da API), `Permissions-Policy`. Já existem HSTS/X-Frame/nosniff/Referrer.
- [ ] **CORS/cookies em produção:** `Cors:FrontendOrigin=https://app.SEUDOMINIO.com.br`; cookies `Secure` (já automático em https); validar que o antiforgery funciona via BFF.
- [ ] **LGPD (dado de saúde é dado sensível)** — executar com as skills do §5.0 (`lgpd-*`), gerando os artefatos em `.lgpd/`:
  - [ ] ROPA, RIPD, base legal por atividade, designação do encarregado, DPAs com operadores e plano de incidentes (`.lgpd/`).
  - [ ] Páginas `/privacidade` e `/termos` (🧑 texto revisado por advogado; MarcaAí atua como **operadora** dos dados dos pacientes e o profissional como **controlador** — deixar isso nos termos).
  - [ ] Checkbox de consentimento no formulário público de agendamento (com link para a política) e registro de data/versão do consentimento no `Booking`.
  - [ ] Direitos do titular: o profissional consegue exportar (CSV) e excluir/anonimizar dados de um paciente; o usuário consegue excluir a própria conta.
  - [ ] Política de retenção (🧑 definir prazo) + job de anonimização de bookings antigos cancelados.
  - [ ] Canal de contato do encarregado (DPO) no rodapé.
- [ ] **Segredos:** produção lê tudo de `.env` do compose (fora do git) ou Docker secrets; `Jwt:SigningKey` novo gerado com 64 bytes aleatórios; rotacionar todas as chaves que já passaram por Render/Vercel/Supabase. (A senha do banco do Supabase já foi resetada durante o backup e não será mais usada.)
- [ ] **Backup do Supabase:** confirmar que `marcaai-supabase.dump` está guardado fora do PC e que nenhum dump/arquivo `.sql` com dados está dentro do repositório (adicionar `*.dump` e `*.backup` ao `.gitignore` da raiz).
- [ ] Revisar `docs/healthtech-pivot-checklist.md` §6 e marcar o que já foi feito.

**Aceite:** varredura OWASP básica (ex.: OWASP ZAP baseline contra o ambiente local) sem achados high; consentimento gravado no booking; páginas legais publicadas.

---

### F8 — Testes e CI

**Objetivo:** confiança para mexer e lançar. (O i18n da antiga "Fase 9" **não** bloqueia o lançamento — foi para o pós-lançamento.)

Backend (novo):
- [ ] Criar `backend/tests/MarcaAi.Application.Tests` (xUnit): `AvailabilityCalculator`, `SlotCalculator`, `TimeUtils` (fusos, horário de verão, exceções, buffers, grade por duração), `FeeCalculator`, `BillingStatusMapper`, `PlanCatalog`.
- [ ] Criar `backend/tests/MarcaAi.Api.IntegrationTests` com `WebApplicationFactory` + **Testcontainers (Postgres 18)**: criar booking, **dois bookings concorrentes no mesmo slot → só um passa**, cancelar, RBAC de teams, IDOR de payouts (regressão da F3), webhooks Stripe com payload assinado de teste.
- [ ] Adicionar os projetos de teste ao `MarcaAi.sln` (o `build.sh` já roda `dotnet test` se encontrar `*Tests*.csproj`).

Frontend:
- [ ] Unitários de `lib/api/*` (CSRF, `ApiError.kind` ↔ status, refresh/retry do BFF), `lib/plans/plan-config.ts`, `lib/brand-theme.ts`, `formatBRLCents`, `use-payment-status` (backoff).
- [ ] E2E smoke (Playwright) contra o compose local: login magic link (pegando o link no Mailpit via API dele), onboarding, criar tipo de consulta, **agendamento público ponta a ponta** (regressão do achado #1).

CI (`.github/workflows/ci.yml`):
- [ ] Node 24; corrigir `NEXT_PUBLIC_API_URL` (sem `/api/v1`).
- [ ] Novo job `backend`: `setup-dotnet` 10.x → `restore` → `build -c Release` → `test` (Testcontainers funciona nos runners ubuntu do GitHub).
- [ ] Job e2e em `workflow_dispatch` (sob demanda) para não pesar todo PR.

**Aceite:** CI verde nos dois jobs; cobertura de `Application/Scheduling` ≥ 80%.

---

### F9 — Deploy de produção no PC

**Objetivo:** MarcaAí rodando 24/7 no seu PC, acessível por HTTPS no seu domínio.

- [ ] `frontend/Dockerfile` multi-stage (Node 24 alpine, `output: standalone`, usuário não-root), com `NEXT_PUBLIC_*` como **build args** (são embutidas no build) e `API_INTERNAL_URL` como env de runtime.
- [ ] `docker-compose.prod.yml` na raiz com os serviços: `postgres` (18-alpine, volume nomeado em `/var/lib/postgresql`, healthcheck `pg_isready`, **sem porta exposta no host**), `api` (depends_on postgres healthy, `ASPNETCORE_ENVIRONMENT=Production`, healthcheck em `/health`), `web` (depends_on api), `cloudflared` (`tunnel run` com `TUNNEL_TOKEN`), `backup` e, opcional, `evolution-api` (profile `whatsapp`). Todos com `restart: unless-stopped` e limites de log (`max-size`).
- [ ] Ajustar `ForwardedHeaders` para confiar só na rede interna do compose; manter `UseHttpsRedirection` coerente com TLS terminado no Cloudflare (o tráfego tunnel → api é http interno).
- [ ] **Backup:** container com cron diário: `pg_dump -Fc` → criptografar (`age` ou `gpg`) → enviar com `rclone` para destino externo 🧑 (Cloudflare R2 / Backblaze B2 / Google Drive) → reter 7 diários + 4 semanais + 6 mensais. Script `scripts/restore-backup.ps1` + **teste de restauração documentado**.
- [ ] **Cloudflare Tunnel** (guia passo a passo no `docs/deploy-self-host.md`): domínio na Cloudflare → Zero Trust → Tunnels → criar túnel → copiar token → Public Hostnames `app.` → `http://web:3000` e `api.` → `http://api:8080`. Opcional: proteger `api.SEUDOMINIO/hangfire` com Cloudflare Access.
- [ ] **Windows 24/7** (no mesmo guia): Docker Desktop com WSL2 e "Start Docker Desktop when you sign in"; login automático do Windows ou Docker Engine no WSL2 iniciado pelo Agendador de Tarefas; plano de energia sem suspensão; horário ativo do Windows Update; BitLocker; nobreak.
- [ ] **Deploy contínuo simples:** `scripts/deploy.ps1` → `git pull` → `docker compose -f docker-compose.prod.yml build` → `up -d` → checar `/health` → em caso de falha, voltar para a imagem anterior (tag por commit).
- [ ] **Monitoramento externo:** monitor HTTP em `https://api.SEUDOMINIO/health` e `https://app.SEUDOMINIO` (serviço externo grátis, alerta por e-mail/Telegram). Logs: `docker compose logs`; 🧑 opcional Seq/Grafana Loki depois.
- [ ] Runbook `docs/runbook.md`: como subir, derrubar, ver logs, restaurar backup, rotacionar segredos, o que fazer se o PC cair.

**Aceite:** acessar `https://app.SEUDOMINIO.com.br` de um celular no 4G, cadastrar, agendar e pagar (modo teste); reiniciar o PC e o sistema voltar sozinho; backup do dia presente no destino externo e restaurado com sucesso num banco de teste.

---

### F10 — Go-live

- [ ] 🧑 Domínio comprado e na Cloudflare; e-mail do domínio funcionando.
- [ ] Stripe em **modo live**: chaves live, preços live, webhooks live apontando para `https://api.SEUDOMINIO/api/v1/webhooks/stripe` e `/stripe/connect` (com a API version do Stripe.net da F2).
- [ ] Google OAuth: app publicado (login com escopos básicos); verificação dos escopos de Calendar submetida.
- [ ] Termos, privacidade, consentimento e canal do DPO no ar. **Gate LGPD do §5.0 aprovado** (`.lgpd/STATUS.md` sem pendência crítica + revisão jurídica).
- [ ] Rotacionar todos os segredos usados em dev/Render/Vercel/Supabase; `Jwt:SigningKey` de produção exclusivo.
- [ ] Teste de fumaça em produção: cadastro → onboarding → tipo de consulta → agendamento público → pagamento real pequeno → e-mail recebido → lembrete → cancelamento/reembolso.
- [ ] 🧑 Beta fechado com 3–5 profissionais conhecidos antes de abrir; canal de suporte (WhatsApp/e-mail) visível no dashboard.
- [ ] Desligar/excluir os serviços antigos (Render, Vercel) depois de confirmar que nada aponta mais para eles.
- [ ] 🧑 Excluir o projeto do Supabase **só depois** de: importação em dev validada (F1) + backup guardado fora do PC. Antes de excluir, gerar um último dump se tiver havido qualquer uso novo.

---

## 6. Decisões pendentes do dono 🧑

| # | Decisão | Recomendação | Fase |
|---|---|---|---|
| D1 | ~~Recuperar dados do Supabase?~~ → ✅ backup feito. Agora: importar o dump no banco de **dev**? | Sim em dev; produção começa limpa | F1 |
| D1b | Manter o PostgreSQL 17 nativo instalado pelo winget? | Manter só pelas ferramentas CLI, serviço em "Manual" | F0 |
| D2 | Versionar `docs/` no git? | Sim | F0 |
| D3 | Abandonar Vercel/Render de vez? | Sim (tudo no compose) | F0 |
| D4 | Página pública da clínica no MVP? | Pode ficar para depois do lançamento | F4 |
| D5 | Regra do trial de 30 dias (Stripe com cartão × interno sem cartão) | Interno sem cartão (menos atrito) | F4 |
| D6 | Política de cancelamento/reembolso de consulta paga | Reembolso total até 24h antes | F4 |
| D7 | Provedores de pagamento no lançamento (só Stripe × Stripe + MP PIX) | Um caminho só, bem testado | F5 |
| D8 | WhatsApp (Evolution, não oficial) no MVP? | Opcional, número dedicado | F6 |
| D9 | Destino do backup externo | Cloudflare R2 (já vai usar a Cloudflare) | F9 |
| D10 | Prazo de retenção de dados de pacientes | Definir com advogado | F7 |
| D11 | Domínio definitivo | — | F9/F10 |
| D12 | Instalar as skills `goul4rt/lgpd-skills`? | ✅ **Decidido: cópia fixa em `.claude/skills/`** (commit `d85d79a`, revisado; ver `.claude/skills/LGPD-SKILLS-VERSION.md`) | F1 |
| D13 | Quem será o encarregado (DPO) e qual advogado revisa política/termos/DPAs? | Definir antes da F7 | F7 |

---

## 7. Pós-lançamento

- i18n com `next-intl` (antiga Fase 9.1 — só faz sentido quando houver um 2º idioma).
- Agendamento recorrente (`recurringCount`), anamnese/formulários avançados.
- Rateio interno da clínica (`RevenueShareRule`, coluna "sua fatia").
- Migrar Server Actions-proxy (`lib/actions/*`) para o BFF (ADR-0001).
- recharts v3, transferência de propriedade da clínica, relatórios avançados.
- Manter a rotina LGPD: reexecutar `lgpd-audit` a cada release relevante, atualizar ROPA/RIPD quando entrar novo dado/operador, teste de mesa de incidente semestral, `/plugin marketplace update lgpd-skills` para acompanhar mudanças normativas.
- Migração do PC para uma VPS (mesmo compose + restaurar backup + trocar o destino do túnel).

---

## 8. Apêndice

### 8.1 Mapa de arquivos-chave

| Área | Frontend (`frontend/`) | Backend (`backend/src/`) |
|---|---|---|
| Config/env | `lib/env.ts`, `lib/api/config.ts`, `next.config.ts` | `MarcaAi.Api/Program.cs`, `appsettings*.json`, `MarcaAi.Infrastructure/DependencyInjection.cs` |
| Cliente HTTP/BFF | `lib/api/http-client.ts`, `lib/api/client.ts`, `app/api/bff/[...path]/route.ts`, `lib/api/endpoints.ts` | — |
| Auth | `app/login`, `app/auth/*`, `lib/auth/guards.ts`, `proxy.ts` | `Controllers/AuthController.cs`, `GoogleAuthController.cs`, `Api/Auth/AuthSessionWriter.cs`, `Infrastructure/Identity/*` |
| Agendamento público | `app/(public)/[username]/**`, `components/booking/*`, `app/api/book/*`, `app/api/slots` | `PublicController.cs`, `SlotsController.cs`, `BookingsController.cs`, `Infrastructure/Bookings/BookingService.cs`, `Application/Scheduling/*` |
| Planos/billing | `lib/plans/plan-config.ts`, `components/billing/*`, `app/(dashboard)/dashboard/plans` | `Application/Features/Billing/PlanCatalog.cs`, `Infrastructure/Billing/*`, `BillingController.cs`, `UserBillingController.cs` |
| Pagamentos/split | `components/payment/*`, `app/(public)/booking/[uid]/pay` | `Infrastructure/Payments/*`, `StripeWebhookController.cs`, `MercadoPagoWebhookController.cs`, `PayoutsController.cs` |
| Financeiro | `app/(dashboard)/dashboard/financeiro`, `components/finance/*` | `FinanceController.cs`, `Infrastructure/Finance/FinanceReportService.cs` |
| Clínica | `app/(dashboard)/dashboard/team/**`, `components/team/*` | `TeamsController.cs` |
| Jobs/notificações | — | `Infrastructure/Jobs/ReminderJob.cs`, `Notifications/*`, `Email/*`, `WhatsApp/*` |
| Migrations | — | `MarcaAi.Infrastructure/Migrations/` (3: InitialCreate, AddFinancialSplit, AddUserBilling) |
| Docs de referência | `docs/future-phases-spec.md`, `docs/backend-backlog.md`, `docs/backend-api.md`, `docs/test-checklist.md`, `docs/local-webhooks-setup.md`, `docs/adrs/*`, `docs/specs/*` | |

### 8.2 Comandos úteis

```bash
# Infra de dev (Postgres em localhost:5433, Mailpit UI em http://localhost:8025)
docker compose -f docker-compose.dev.yml up -d

# Inspecionar o backup do Supabase
docker run --rm -v C:\Code\marcaAi-backup:/backup postgres:18-alpine pg_restore -l /backup/marcaai-supabase.dump

# Backend
cd backend
dotnet restore && dotnet build
dotnet run --project src/MarcaAi.Api                 # http://localhost:5080  (/health, /openapi/v1.json)
dotnet ef migrations add Nome --project src/MarcaAi.Infrastructure --startup-project src/MarcaAi.Api
dotnet test
dotnet list package --outdated

# Frontend
cd frontend
npm install && npm run dev                           # http://localhost:3000
npx tsc --noEmit && npm run lint && npm run test && npm run build
npm run test:e2e

# Validação completa (raiz)
./build.sh

# Webhooks locais
stripe listen --forward-to localhost:5080/api/v1/webhooks/stripe
stripe listen --forward-to localhost:5080/api/v1/webhooks/stripe/connect
```

---

## 9. Registro de execução

> O Claude Code preenche ao fim de cada fase: data, branch, o que foi feito, desvios do plano, pendências.

| Fase | Data | Branch / PR | Resumo | Pendências |
|---|---|---|---|---|
| Imediata | 06/11/2026 | — (feito pelo dono, sem código) | Supabase reativado; `pg_dump` do schema `public` via Session pooler → `C:\Code\marcaAi-backup\marcaai-supabase.dump`, validado com `pg_restore -l`. Docker Desktop instalado e funcionando. PostgreSQL 17 nativo instalado via winget (possível conflito na 5432). | Copiar o backup para fora do PC; importar em dev (F1); excluir projeto Supabase (F10). |
| F0 | 06/11/2026 | `fase-0-higiene` (3 commits, sem push) | `docs/` versionado (removido `/docs/` do .gitignore; `*.dump`/`*.backup` ignorados; varredura sem segredos reais); overrides corrigidos; `frontend/.env` limpo (backup local fora do repo); `docker-compose.dev.yml` (Postgres 18 :5433 + Mailpit); `.env.example` raiz e backend; `global.json` (10.0.100, `latestFeature` — `latestPatch` rejeitaria o SDK 10.0.301 instalado); `engines` Node>=24 + `.nvmrc`; `vercel.json` removido; READMEs atualizados. `./build.sh` verde, compose healthy, Mailpit 200. | Parar serviço PG17 nativo (admin). Para F1: user-secrets antigos (`ConnectionStrings:Default`, Google, Resend) e `appsettings.Development.json` ainda em 5432/testdb. Docker Desktop estava parado no início; está em `%LOCALAPPDATA%\Programs\DockerDesktop`. `PROMPT_CLAUDE_CODE.md` segue não versionado. |
| F1 | 06/11/2026 | `fase-1-banco-local` (4 commits, sem push; parte de `main` já com a F0 mergeada em fast-forward local) | Pool/workers configuráveis (`Database:MaxPoolSize`, `Hangfire:*`); `appsettings.Development.json` -> Postgres do compose (5433); user-secret `ConnectionStrings:Default` (Supabase) removido; API cria 17 tabelas, 12 enums e schema Hangfire; `Check_Sync` vazio (removido); `scripts/import-supabase-backup.ps1/.sh` (testados; restore sem erros inesperados, `normalize_plan_codes.sql` roda; contagens conferidas); API sobre o banco importado: /health ok, perfil publico 200. Gate LGPD: `.lgpd/STATUS.md`, `data-map.md`, `gaps.md` (19 gaps, 6 criticos). | Teste manual login/onboarding pela UI (Resend esta nos user-secrets: magic link enviaria e-mail real; usar Mailpit na F6). Achado novo LGPD: landing diz 'Conforme a LGPD' e linka /termos e /privacidade que nao existem (G01). Descartar dump/banco de dev com dado real (G14). Seed nao feito. Armadilha: `dotnet run --no-build` apos `ef migrations add/remove` usa DLL velha - rebuild antes. |
| F2 | 06/11/2026 | `fase-2-dependencias` (5 commits, sem push; parte da `main` com F0+F1 em fast-forward local) | Backend: EF/Npgsql/ASP.NET 10.0.14, Hangfire 1.8.25/PG 1.21.1, JWT 8.23, OpenApi 2.13, cuid 7.1; **Stripe.net 51.1.0 -> 53.1.0 compilou sem ajustes** (API version do pacote: `2026-10-28.endive`). Dockerfile: porta 8080, usuario nao-root `app` (imagem buildada e /health 200). Frontend: Next 16.4.5, React 19.3.1, lockfile regenerado, minors via ncu, react-day-picker 9.14 (calendar.tsx reescrito; `overrides` removido), @stripe/stripe-js 10 + react-stripe-js 7, @types/node 24, Playwright 1.65; `ignoreBuildErrors` removido, `output: standalone`, Turbopack (dev e build, flags --webpack removidas). `./build.sh` verde, 12 testes unit ok, `npm audit --omit=dev`: 0 vulnerabilidades. | (1) **F5:** o endpoint de webhook do Stripe deve ser criado com a API version `2026-10-28.endive`, senao `EventUtility.ConstructEvent` lanca por mismatch; testar checkout/Connect/webhooks. (2) `calendar.tsx` (v9) nao e usado em nenhuma tela: sem teste visual. (3) Nao atualizados (majors fora da lista): lucide-react 1.x, motion 14, eslint 10, @hookform/resolvers 7, jsdom 31, vitest-coverage 5, dotenv 18, react-resizable-panels 4, jest-dom 7, recharts (mantem 2.x). react-day-picker tem v10 mas usei 9 conforme o plano. (4) `npm audit` completo: 8 moderate so em dev (cadeia eslint/minimatch); `audit fix --force` rebaixaria eslint-config-next, entao ignorado. (5) Warning ASPDEPR005 `KnownNetworks` -> `KnownIPNetworks` em Program.cs:171: resolver junto do ForwardedHeaders (F9/F7). (6) npm 12 bloqueia scripts de instalacao (esbuild); testes passam mesmo assim. (7) `next dev` gera `frontend/AGENTS.md` (regras para agentes); mantido no repo. (8) Playwright e2e nao rodado. |
| F3 | 06/11/2026 | `fase-3-correcoes-criticas` (4 commits, sem push; parte da `main` com F0-F2 em fast-forward local) | **#1** `PublicProfileDto` agora tem `Id` (+ `requiresConfirm`, buffers e `bookingLimitDays` por tipo); front usa os valores reais; testado: perfil -> slots (13, com buffers) -> booking 201 -> detalhe -> mesmo slot 409. **#2** `DELETE /payouts/{id}`: dono (USER) ou gestor da clínica; alheio/inexistente = 404 (testado B->conta de A = 404, conta intacta; A = 204). **#3** `ProductionConfigValidator`: fora de Development o boot falha sem ConnectionString, Jwt (>=32 bytes, sem 'dev/secret/changeme'), App:PublicUrl/Cors https e Resend:ApiKey; avisos para Stripe/MP/Google/WhatsApp (testado). **#4** `/hangfire`: Development só local; fora disso só `Admin:HangfireUserIds` (anônimo = 401 testado; caminho do admin autenticado não testado). **PII em logs:** removidos e-mail/telefone/corpos de resposta de provedores (corpo só em Debug); senders de simulação só logam tamanho em Information. **`API_INTERNAL_URL`** server-only no front (fallback `NEXT_PUBLIC_API_URL`). `./build.sh` verde, 12 testes ok. | **Achados novos (ver §2 #16 e #17):** booking por uid anônimo/CUID previsível; antiforgery nunca validado. Itens: o magic link continua logado no `LoggingMagicLinkSender` em Development (intencional; bloqueado em produção pelo validador). `dotnet run` usa `launchSettings.json` (Development) — em testes de Production usar `--no-launch-profile`. O dashboard do Hangfire com antiforgery `Secure=Always` só abre via HTTPS (header `X-Forwarded-Proto`). Pasta de teste: usuários/contas fictícios criados e apagados do banco de dev. Sem testes automatizados (F8): adicionar regressão do IDOR e do fluxo público. |
| F4 | 06/11/2026 | `fase-4-gaps-de-produto` (4 commits, sem push; parte da `main` com F0-F3 em fast-forward local) | **Backend:** `PUT /teams/{id}/members/{userId}` (só OWNER/ADMIN; nunca o OWNER nem o próprio); `POST /bookings/{uid}/confirm` (dono ou gestor; 404 para estranho); `GET /me/profile` + `Specialty/Council/RegistrationNumber/ClinicName`; `GET /event-types/{id}` + `questions` no input; `POST /bookings` com `responses` (validadas) e `consentAccepted` obrigatório (grava `ConsentAt/ConsentVersion`); `GET /finance/statement` (paginado, filtros server-side); `GET /public/team/{slug}` (sem e-mail); grade de slots por duração (`TimeUtils.GridMinutesFor`, 9 testes xUnit — 1º projeto de testes); **trial interno de 30 dias** (`User/Team.TrialEndsAt`, avaliado na leitura, sem job — desvio: o plano previa um job diário); **reembolso (D6)**: integral se paciente cancela com 24h+ ou se o cancelamento é do profissional (papel vem da identidade autenticada, não do corpo); `PrivacyController` (exportar/anonimizar paciente, exportar/excluir conta). Migration `F4_ProductGaps_Trial_Consent_Profile` (só colunas nullable). **Front:** checkbox de consentimento, perguntas reais no formulário, aprovação manual reativada, perfil com campos novos e pré-preenchido por `/me/profile`, edição de tipos com perguntas/buffers, página da clínica real, tela `/settings/privacy`. Removido o vazamento de exceção 'TEMPORÁRIO' do `UpdateProfile`. | (1) **Política/termos**: o checkbox aponta para `/privacidade`, que ainda não existe (404 — G01). (2) Reembolso real só testável com Stripe/MP configurados (F5): testado FAILED (sem Stripe) e NOT_ELIGIBLE. Reembolso parcial/`PARTIALLY_REFUNDED` não tratado. (3) `recurringCount` segue sem suporte (campo removido do envio). (4) Tela de extrato financeiro não foi criada (só o endpoint). (5) Cancelamento pela API devolve 200 `{refund}` (antes 204). (6) Excluir conta não encerra contas no Stripe/MP nem cancela Google Calendar. (7) Exportar/anonimizar paciente identifica por e-mail do booking, sem verificar a identidade do solicitante (o profissional é quem atende o pedido). (8) Trial vale só para contas novas (as 3 contas do dump importado não ganham). (9) Páginas/telas não exercitadas no navegador; e2e Playwright não rodado. |
| F5 | 07/11/2026 | `fase-5-pagamentos` | **Webhooks:** tabela `processed_webhook_events` (PK provedor+evento) e idempotência nos 3 handlers Stripe e no MP; **achado:** `payment_intent.*`/`charge.refunded` (destination charge) chegam ao endpoint da **plataforma**, não ao `/connect` — `/webhooks/stripe` agora também os processa; baixa só se id do `PaymentIntent`, valor e taxa baterem com o snapshot do booking; `payment_failed` → FAILED. **Mercado Pago:** webhook exige `x-signature` (HMAC, anti-replay 10 min, fail-closed sem secret), reconsulta o pagamento com o **token do vendedor** e confere valor/`external_reference`; OAuth do vendedor completo (URL com `state` assinado de 15 min, callback, tokens **cifrados** com Data Protection, refresh, descarte no disconnect); removido o fallback para o token do marketplace. **Bug financeiro corrigido:** `BookingService.CreateAsync` criava um PIX na conta da plataforma, sem split, em paralelo ao `/pay` — removido. Taxa em trial interno passa a ser Solo Pro (5%). Migration `F5_Webhook_Idempotency_MpSellerTokens`; validador de produção exige segredos de webhook/MP/`DataProtection:KeysPath` quando configurados; spec §4.3 reconciliada. Testes: 22 xUnit (taxa por plano, assinatura MP) + script de integração 28/28 (assinaturas Stripe/MP forjadas, divergência de valor/taxa, reentrega, falha, reembolso, OAuth). | (1) Sem contas Stripe/MP reais: `stripe listen`, `docs/test-checklist.md` e OAuth/PIX reais **não foram rodados**; (2) PIX no frontend depende de o vendedor conectar o MP (senão 409 "cadastro de recebimentos"); (3) `processed_webhook_events` cresce sem limpeza (F7); (4) o `state` do OAuth não é amarrado a cookie (um vendedor pode ser induzido a autorizar o link de outro — impacto baixo); (5) MP não oferece revogação do token: descartamos localmente; (6) reembolso parcial só mapeado por status; (7) `DataProtection:KeysPath` precisa de volume + backup na F9; (8) descrição enviada aos gateways pode revelar serviço de saúde (G22). |
| F6 | | | | |
| F7 | | | | |
| F8 | | | | |
| F9 | | | | |
| F10 | | | | |
