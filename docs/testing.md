# Testes (F8)

| Camada | Onde | Como rodar | O que cobre |
|---|---|---|---|
| Backend — unitários | `backend/tests/MarcaAi.Application.Tests` | `dotnet test backend/tests/MarcaAi.Application.Tests` | Agenda (`AvailabilityCalculator`, `SlotCalculator`, `TimeUtils`: fusos, horário de verão, exceções, buffers, grade), taxas (`FeeCalculator`), planos e status de cobrança, assinatura do webhook do Mercado Pago |
| Backend — integração (inclui V2: CSRF, uid, rate limit real, trial, lembrete, painel e captura de erros) | `backend/tests/MarcaAi.Api.IntegrationTests` | `dotnet test backend/tests/MarcaAi.Api.IntegrationTests` (**precisa de Docker**) | API real (`WebApplicationFactory`) contra **Postgres 18 descartável** (Testcontainers): agendamento, **concorrência no mesmo horário**, cancelamento, RBAC de times, IDOR de payouts, webhooks do Stripe assinados, magic link, **gate LGPD** (consentimento gravado, exportar/anonimizar/excluir, job de retenção) |
| Frontend — unitários | `frontend/tests/unit` | `cd frontend && npm test` | `ApiError` ↔ status, cliente do browser, `rawApiFetch` (CSRF, cookie, IP real), BFF (401 → refresh → retry), `plan-config`, `brand-theme`, `formatBRLCents`, `usePaymentStatus` (backoff) |
| E2E (Playwright) | `frontend/tests/e2e` | `cd frontend && npm run test:e2e` | Landing/login/páginas legais; login por magic link (e-mail lido no Mailpit), onboarding, tipo de consulta, **agendamento público ponta a ponta** com consentimento obrigatório, detalhe e cancelamento; **jornada paga** (bloqueio sem recebimento, reserva com contador, pagamento simulado, confirmação, remarcação, lista de pacientes) |

**Verificação única (recomendada):** `scripts/verify.sh` (Windows: `scriptserify.ps1`) — segredos, build e testes do backend (unit + integração), migrations sem mudança pendente, auditoria de dependências, front (tsc, lint **sem avisos**, unit, build) e E2E contra o build de produção; resume por passo e sai com 1 se algo falhar. `--fast` pula o E2E (é o que o pre-push roda); `--no-docker` pula integração e E2E (não substitui o completo). Hooks: `scripts/install-hooks.sh`. O scanner de segredos tem teste próprio (`scripts/tests/test-scan-secrets.sh`).

Só o build/testes (sem E2E, auditoria e segredos): `./build.sh`. Sem Docker, `SKIP_INTEGRATION=1 ./build.sh` pula a integração.

## Acessibilidade, cobertura e carga (V2)
- **Acessibilidade:** `@axe-core/playwright` varre landing, login, páginas legais, 404 e, dentro da jornada paga, a página do serviço, o pagamento, a consulta, a remarcação e a lista de pacientes. Falha com violação `serious`/`critical` (WCAG 2.1 A/AA).
- **I2 (backend/integração):** `I2OutboxTests` (e-mail cai e volta, sem duplicar, cancelada antes do envio, morta e reenfileirada, jobs simultâneos, retenção), `I2ListsTests` (paginação, abas, busca, 10 mil consultas), `I2CacheTests` (acerto, invalidação por API e por gravação, commit × rollback), `I2IdempotencyTests` (replay, corpo diferente, duplo clique simultâneo, pagamento), `I2SlotsMonthTests` (mês = dia a dia), `I2JobsTests` (retries e painel).
- **Cobertura do front:** `cd frontend && npm run test:coverage` (limiar 70%; hoje ~93% de linhas em `lib/`).
- **E2E:** roda contra o **build de produção** do Next (`next build && next start`); `E2E_DEV=1` usa o `next dev`. A API do E2E sobe com `RateLimit__Multiplier=50` (todas as requisições vêm do mesmo IP).
- **Carga:** `scripts/loadtest.mjs` — ver `docs/load-test.md`.

## Pagamento simulado (jornada paga offline)
`Payments:Provider=Fake` (só desenvolvimento/teste; o boot de produção recusa) troca o Stripe por um provedor simulado: `POST /api/v1/dev/payouts/activate` ativa os recebimentos do usuário logado e `POST /api/v1/dev/payments/{uid}/approve` aprova o pagamento pelo mesmo caminho do webhook (os endpoints respondem 404 fora do modo Fake). O `ApiFixture` e o `playwright.config.ts` já ligam esse modo. A tela de pagamento mostra o botão "Simular pagamento aprovado" quando o `clientSecret` começa com `fake_secret_`.

## E2E: pré-requisitos

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres (5433) + Mailpit (SMTP 1025 / UI 8025)
```

O `playwright.config.ts` sobe a API (`:5080`, `Development`) e o Next (`:3000`) sozinho, ou reaproveita os que já estiverem no ar. O spec cria os próprios dados (e-mail/username aleatórios), sem seed.

A API do E2E é iniciada com `Resend__ApiKey=""` e `Smtp__Host=localhost`: os user-secrets de desenvolvimento podem ter uma chave real do Resend, e o teste **nunca** deve mandar e-mail de verdade.

## Isolamento dos testes de integração

O Postgres do teste é um container novo por execução. A configuração é passada por **variáveis de ambiente**, que têm precedência sobre `appsettings` e user-secrets: o teste nunca encosta no banco de dev nem usa chaves reais. `RateLimit:Multiplier=1000` evita que o limite por IP (todos os testes compartilham um) derrube a suíte; o comportamento do limiter em si foi verificado na F7.

## Cobertura

- `Application/Scheduling`: **99,5%** das linhas (meta do plano: ≥ 80%).
- Medir: `dotnet test backend/tests/MarcaAi.Application.Tests --collect:"XPlat Code Coverage" --results-directory backend/tests/.cov`.

## CI

`.github/workflows/ci.yml` está **só manual** (`workflow_dispatch`) enquanto não houver minutos do GitHub Actions (ver `PENDENCIAS.md`). Jobs: `backend`, `frontend` e `e2e` (opcional, input `e2e`).
