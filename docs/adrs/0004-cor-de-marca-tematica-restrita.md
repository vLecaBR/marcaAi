# ADR-0004 — Cor de marca temável restrita à página pública

- **Status:** Accepted
- **Data:** 2026-07-25
- **Contexto na spec:** `frontend-healthtech-spec.md` §4.2, §4.3 e §10.4

## Contexto

Cada profissional/clínica tem uma `BrandColor` (default legado roxo `#7c3aed`). A identidade
Healthtech (§4.2) pede paleta séria/calma/acessível (teal/azul) e **WCAG AA** (contraste ≥ 4.5:1).
A spec (§10.4) deixa em aberto o **grau de customização**: cor por profissional × identidade fixa.

## Decisão

**Customização restrita:**

- A cor de marca (`--brand-primary`) é **temável apenas na página pública do paciente**
  (`/[username]` e sub-rotas de agendamento).
- Todo o **dashboard** (profissional e clínica) usa a **paleta Healthtech fixa** da §4.2.
- A cor escolhida é **validada contra contraste AA** no render; se falhar, cai no **fallback teal**
  (`--brand-primary` = `#0F9E8E`). O default global deixa de ser o roxo `#7c3aed`.
- `BrandColor` é tratada como **token temável** (CSS variable), não cor hard-coded.

## Alternativas consideradas

**A. Customização total (marca em todo o app).** Rejeitada: quebra contraste AA (§4.3), fragmenta a
experiência do profissional e dilui a confiança clínica ("cada conta com uma cara").

**B. Identidade fixa sem nenhuma customização.** Rejeitada: `BrandColor` é valor percebido para o
profissional na superfície que o paciente vê; remover tudo perde diferenciação sem ganho real.

## Consequências

**Positivas:** paciente vê a marca do profissional; profissional trabalha numa UI consistente e
acessível; AA garantido por validação com fallback.

**Negativas:** exige um utilitário de verificação de contraste no boundary de tema da página
pública; a customização não alcança o dashboard (decisão intencional).

**Neutras:** substituição do default roxo pelo teal precisa de um passo de dados/migração leve
(apenas default; valores existentes continuam válidos se passarem no contraste).
