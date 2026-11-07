# Testes (F8)

| Camada | Onde | Como rodar | O que cobre |
|---|---|---|---|
| Backend — unitários | `backend/tests/MarcaAi.Application.Tests` | `dotnet test backend/tests/MarcaAi.Application.Tests` | Agenda (`AvailabilityCalculator`, `SlotCalculator`, `TimeUtils`: fusos, horário de verão, exceções, buffers, grade), taxas (`FeeCalculator`), planos e status de cobrança, assinatura do webhook do Mercado Pago |
| Backend — integração | `backend/tests/MarcaAi.Api.IntegrationTests` | `dotnet test backend/tests/MarcaAi.Api.IntegrationTests` (**precisa de Docker**) | API real (`WebApplicationFactory`) contra **Postgres 18 descartável** (Testcontainers): agendamento, **concorrência no mesmo horário**, cancelamento, RBAC de times, IDOR de payouts, webhooks do Stripe assinados, magic link, **gate LGPD** (consentimento gravado, exportar/anonimizar/excluir, job de retenção) |
| Frontend — unitários | `frontend/tests/unit` | `cd frontend && npm test` | `ApiError` ↔ status, cliente do browser, `rawApiFetch` (CSRF, cookie, IP real), BFF (401 → refresh → retry), `plan-config`, `brand-theme`, `formatBRLCents`, `usePaymentStatus` (backoff) |
| E2E (Playwright) | `frontend/tests/e2e` | `cd frontend && npm run test:e2e` | Landing/login/páginas legais; login por magic link (e-mail lido no Mailpit), onboarding, tipo de consulta, **agendamento público ponta a ponta** com consentimento obrigatório, detalhe e cancelamento; **jornada paga** (bloqueio sem recebimento, reserva com contador, pagamento simulado, confirmação, remarcação, lista de pacientes) |

Tudo de uma vez (build + unitários + integração + lint + build do front): `./build.sh`. Sem Docker, `SKIP_INTEGRATION=1 ./build.sh` pula a integração.

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
