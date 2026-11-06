# ADR-0005 — Infra de i18n desde o dia 1 (pt-BR único por ora)

- **Status:** Accepted
- **Data:** 2026-07-25
- **Contexto na spec:** `frontend-healthtech-spec.md` §4.3, §8 e §10.5

## Contexto

O produto lança em **pt-BR**, mas há intenção de internacionalização futura. A spec (§10.5) pede
"estrutura para futura internacionalização". Além do texto, datas/horas devem sempre exibir
**timezone explícito** e moeda formatada por locale (§4.3, §8).

## Decisão

Instalar a **infraestrutura de i18n desde o dia 1**, mantendo **pt-BR como único locale** por ora:

- Adotar **`next-intl`** (integração nativa com App Router/RSC).
- **Zero string hardcoded** na UI: todo texto vive em catálogo (`messages/pt-BR.json`).
- Formatação de datas/horas via `Intl` com **locale + timezone explícitos** (nunca assumir o fuso
  do servidor); moeda em BRL via `Intl.NumberFormat`.
- **Não traduzir** para outros idiomas agora — apenas evitar acumular o débito de extração.

## Alternativas consideradas

**A. Hardcode em pt-BR e i18n depois.** Rejeitada: retrofitar i18n num app inteiro (extrair
centenas de strings espalhadas) é caríssimo e propenso a erro. O custo de externalizar desde o
início é baixo; o de adiar cresce com cada tela.

**B. i18n custom leve.** Rejeitada: reinventa formatação de plural/data/número que `next-intl` já
resolve com integração RSC.

## Consequências

**Positivas:** adicionar um segundo locale vira "traduzir o catálogo", sem tocar componentes;
formatação de data/moeda correta e consistente; casa com o requisito de timezone explícito (§4.3/§8).

**Negativas:** leve overhead de disciplina (usar `t()` em vez de literais) e uma dependência a mais.

**Neutras:** estrutura de rotas permanece sem prefixo de locale enquanto houver só pt-BR; o prefixo
(`/pt-BR/...`) pode ser habilitado depois sem reescrever páginas.
