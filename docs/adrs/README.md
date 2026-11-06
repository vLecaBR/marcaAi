# Architecture Decision Records — MarcaAí Frontend

Registro das decisões arquiteturais do frontend (Next.js App Router consumindo a API .NET).
Cada ADR captura o **contexto**, a **decisão**, as **alternativas** e as **consequências**.

Formato inspirado em [MADR](https://adr.github.io/madr/). Um ADR nunca é editado após
`Accepted`; para mudar uma decisão, cria-se um novo ADR que **supersede** o anterior.

## Índice

| # | Título | Status | Data |
|---|--------|--------|------|
| [0001](./0001-bff-com-route-handlers.md) | BFF com Route Handlers (em vez de Server Actions) | Accepted | 2026-07-25 |
| [0002](./0002-confirmacao-pagamento-polling.md) | Confirmação de pagamento via polling com backoff | Accepted | 2026-07-25 |
| [0003](./0003-finance-controller-dedicado.md) | `FinanceController` dedicado para leitura financeira | Accepted | 2026-07-25 |
| [0004](./0004-cor-de-marca-tematica-restrita.md) | Cor de marca temável restrita à página pública | Accepted | 2026-07-25 |
| [0005](./0005-i18n-infra-desde-o-inicio.md) | Infra de i18n desde o dia 1 (pt-BR único) | Accepted | 2026-07-25 |
| [0006](./0006-design-system-healthtech.md) | Design System Healthtech (Teal clínico como fonte única) | Accepted | 2026-07-28 |

## Referências

- `docs/specs/frontend-healthtech-spec.md` — fonte da verdade do frontend (§10 = decisões que estes ADRs resolvem).
- `docs/specs/financial-split-spec.md` — modelagem financeira do backend.
- `docs/backend-backlog.md` — dependências de backend geradas por estas decisões (ADR-0003).
