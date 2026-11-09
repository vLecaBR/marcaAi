# MarcaAí — contexto para quem abre este repositório sem memória

SaaS de **agenda e recebimento para profissionais de saúde** (consultórios e clínicas, Brasil). Monorepo:
`backend/` (.NET 10, Clean Architecture, EF Core, Postgres 18) · `frontend/` (Next.js 16 App Router, BFF, Tailwind) · `ops/` (backup) · `scripts/` · `docs/`.
Meta: relançar **hospedado no PC do dono** (Docker Compose + Cloudflare Tunnel), saindo de Vercel/Render/Supabase. Dono: fala português; Windows 11.

## Leia primeiro (nesta ordem)
1. `PLANO_INTERNO.md` — o plano em execução (melhorias internas, sem depender de contas externas).
2. `PENDENCIAS.md` — o que depende do dono (contas, advogado, decisões).
3. `PLANO_DE_VENDA.md` (V1–V7: do produto à venda) e `PLANO_DE_LANCAMENTO.md` (F0–F10: infra; §9 = registro de execução).
4. `docs/verificacao-ponta-a-ponta.md`, `docs/testing.md`, `docs/runbook.md`, `docs/deploy-self-host.md`.

## Regras permanentes do dono (valem sempre)
- Trabalhar **fase a fase**: implementar → verificar → marcar checkboxes → atualizar §9/registro → **parar e reportar** (feito, verificado, desvios, pendente). Só avançar com "pode seguir".
- Fazer **vários commits pequenos** no estilo do repo (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **Não dar push** a menos que o dono peça (ele costuma pedir "push no final").
- Trabalhar direto na `main`. **Nunca** commitar segredos (`.env*`, user-secrets, chaves Stripe/Resend/Google) nem dumps de banco. O dump do Supabase fica **fora** do repo.
- Decisão do dono (🧑) → perguntar antes, com recomendação. Fora do escopo → registrar em `PENDENCIAS.md` e avisar. Baixar arquivos/imagens de fontes novas → pedir autorização.
- **LGPD sempre** (dados de saúde = sensíveis): skills em `.claude/skills/lgpd-*` (cópia fixa); toda fase tem um gate LGPD; `.lgpd/gaps.md` é o registro.
- Manter a stack, mas consultar versões atuais antes de adicionar dependência.
- Problemas encontrados no caminho: corrigir se pequenos, senão registrar. Reportar fielmente o que **não** foi verificado.

## Comandos
```bash
./build.sh                          # backend (build + unit + integração) + front (lint, tsc, unit, build). SKIP_INTEGRATION=1 pula a integração
cd frontend && npx playwright test  # E2E contra o BUILD DE PRODUÇÃO do Next (E2E_DEV=1 usa next dev); sobe a API sozinho
cd frontend && npm run test:coverage
docker compose -f docker-compose.dev.yml up -d   # Postgres 5433 + Mailpit (SMTP 1025, UI 8025)
node scripts/loadtest.mjs ...       # ver docs/load-test.md
node scripts/v3-readiness.mjs       # pré-voo das contas (só quando houver contas)
```
- **Testes de integração usam Testcontainers: o Docker Desktop precisa estar rodando.** Se não estiver: `Start-Process "C:\Users\victo\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"` e esperar `docker version` responder.
- Pare a API/Next antes de `dotnet build`/migrations (Windows trava DLL). Para liberar as portas: `Get-NetTCPConnection -LocalPort 5080,3000 | Stop-Process`.
- Migration: `cd backend && dotnet ef migrations add Nome -p src/MarcaAi.Infrastructure -s src/MarcaAi.Api` (a API aplica as pendentes no boot).
- **Windows/shell:** scripts `.ps1` precisam de UTF-8 **com BOM** e rodam com `powershell -ExecutionPolicy Bypass -File`; scripts de container precisam de LF (`.gitattributes`); heredocs Bash com aspas complicadas falham — use a ferramenta de escrita de arquivo.

## Arquitetura (o que não é óbvio no código)
- **BFF:** o navegador só fala com o Next (`/api/bff/*` com allowlist em `lib/api/config.ts`, `/api/book/*` públicas, Server Actions). O Next fala com a API (`API_INTERNAL_URL`). Cookies de sessão HttpOnly (`marcaai_at`/`marcaai_rt`); o flag `onboarded` vai **no token** — depois de concluir o onboarding é preciso `POST /api/auth/refresh`.
- **Segurança:** `CsrfOriginGuard` (origem) na API; rate limit nativo por IP (`RateLimit:Multiplier` só para testes/carga); `Booking.Uid` aleatório de 128 bits; `ProductionConfigValidator` falha o boot de produção sem config essencial; CSP no `next.config.ts`; `proxy.ts` do Next limita só `POST /api/book`.
- **Agendamento:** anti double-booking = `pg_advisory_xact_lock` por profissional + `FOR UPDATE SKIP LOCKED` (`BookingConcurrencyGuard`). Consulta **paga online** = reserva `PENDING` com `PaymentDueAt` (15 min, `Payments:HoldMinutes`) → webhook confirma → job `reservas-sem-pagamento` expira; pagamento tardio é reembolsado. `PayOnSite` = cobrança no consultório. Remarcação: paciente ≥24 h antes e ≤2x; profissional sem limite.
- **Pagamento simulado:** `Payments:Provider=Fake` (só dev/teste; o boot de produção recusa) + `POST /api/v1/dev/...` (404 fora do modo Fake). `ApiFixture` e `playwright.config.ts` já ligam.
- **Jobs (Hangfire):** lembretes a cada 15 min (só 2 h antes), expiração de reservas a cada minuto, retenção LGPD diária.
- **Dados:** colunas camelCase por convenção; ids string (CUID) exceto `Booking.Uid`. Backup: `ops/backup` (age + rclone). Observabilidade: `error_events` (sem dado pessoal) + painel `/admin` (ids em `Admin:UserIds`).
- Config por variáveis de ambiente (`Secao__Chave`); o `.env.prod` real **não** vai ao git.

## Estado atual (09/11/2026)
Concluídos: F0–F9 (infra, dados, segurança, LGPD base, testes, deploy local), V1 (produto: cobrança com reserva, remarcar, pacientes…), V2 (robustez: CSRF, uid, erros, painel, a11y, cobertura 93%, carga). Testes: 92 unitários + 59 integração (backend), 130 unitários (front), 8 E2E. **Bloqueado por contas do dono:** V3 (provedores reais), V4 (go-live), V5 (jurídico), V6/V7. CI do GitHub desligado (sem minutos): validar localmente.
