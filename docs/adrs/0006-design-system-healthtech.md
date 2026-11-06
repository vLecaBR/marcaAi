# ADR-0006 — Design System Healthtech (Teal clínico como fonte única)

- **Status:** Accepted
- **Data:** 2026-07-28
- **Contexto na spec:** `future-phases-spec.md` §2.6, §8.5 (Fase 8.5 — Health System Visual & Brand Revamp)
- **Relaciona-se com:** ADR-0004 (cor de marca temável restrita à página pública)

## Contexto

Com as features de negócio no lugar (F0–F8), a plataforma ainda **não tinha a "cara" de um Health
System**. Conviviam duas linguagens visuais: o **legado Violet/Zinc** (landing, `TeamForm`, telas
`/dashboard/teams/*`, formulários e o fluxo público de agendamento em modo escuro `#09090b`) e o
**Teal Healthtech** (dashboard F5–F8). Essa mistura quebrava a imersão e a confiança clínica, e cada
tela reimplementava botões, inputs e modais "à mão", divergindo em espaçamento, foco e acessibilidade.

Era preciso fixar, de forma inequívoca, **qual é o Design System** e **de onde vêm as primitivas de
UI**, para que nenhuma tela futura reintroduza cor fora da paleta nem componente ad-hoc.

## Decisão

**O Design System Healthtech Teal é a fonte única da identidade visual do produto.**

1. **Paleta por tokens (§2.6), nunca cor crua.** Toda cor de UI vem das CSS vars expostas em
   `app/globals.css` via `@theme inline` — `brand-primary` (teal `#0f9e8e`), `brand-secondary`
   (azul `#134e6f`), `care`, `warning`, `destructive`, `surface`, `muted-foreground`, `border`, etc.
   **Proibido** usar utilitários Tailwind de cor bruta para UI (`violet-*`, `fuchsia-*`, `zinc-*`,
   hex soltos). Exceção: a paleta de **acento do tipo de consulta** (`EventTypeColor`: SLATE, ROSE,
   ORANGE, AMBER, EMERALD, TEAL, CYAN) — curada e **sem violet/fuchsia**.
2. **Superfície clara "clinicamente limpa".** Fundos claros (`background`/`surface`/`card`), alto
   contraste, densidade consistente (cards `rounded-2xl`, `border-border/60`, `shadow-sm`). O fluxo
   público de agendamento também é claro (o antigo `#09090b` foi aposentado).
3. **Primitivas de UI únicas.** Componentes convergem para:
   - **Botões** → `components/ui/button.tsx` (variantes/tamanhos). Sem `<button>` cru estilizado.
   - **Inputs/labels** → `components/ui/input.tsx` + `components/ui/label.tsx` (base para RHF + Zod,
     com estados de foco/erro AA); selects/textarea seguem um `controlClass` alinhado ao mesmo token.
   - **Modais** → `Dialog` do Radix (`components/ui/dialog.tsx`) para formulários complexos
     (foco-trap, `Esc`, scroll-lock, `aria-*`); **`MotionModal`** (`components/motion/modal.tsx`)
     para confirmações/detalhes leves.
   - **Skeletons** → `components/ui/skeletons/` (pulsação Teal em opacidade, respeitando
     `prefers-reduced-motion`), compostos nos `loading.tsx` de cada rota.
4. **Acessibilidade AA** é requisito, não opção: foco sempre visível, alvos ≥ 44px, contraste ≥ 4.5:1
   nas superfícies de marca.
5. **Consistência entre vitrine e painel.** A landing encosta na `PricingSection` (referência Teal),
   e o painel interno "respira" a mesma estética — sem quebra de expectativa no login.

**Critério de aceite (atingido):** busca global por `violet` ou `fuchsia` em `app/`, `components/` e
`lib/` retorna **zero**; `zinc` também zerado. `tsc`, `npm run lint` e `npm run build` limpos.

## Alternativas consideradas

**A. Manter as duas paletas e só "encostar" a landing no Teal.** Rejeitada: adia a dívida, mantém a
quebra de confiança no dashboard e deixa o legado se espalhar em novas telas.

**B. Tema escuro como identidade clínica.** Rejeitada: contraste e "sensação de software clínico"
pedem superfície clara e calma (§4.2); o escuro fragmentava landing × painel × fluxo do paciente.

**C. Continuar com componentes ad-hoc por tela (sem primitivas únicas).** Rejeitada: variação
infinita de foco/erro/spacing, custo de manutenção e regressões de acessibilidade.

## Consequências

**Positivas:** identidade única e confiável do login à vitrine ao paciente; um kit de UI reutilizável
e acessível; tech-debt de UI da §6 quitado; regressões de cor viram detectáveis por um simples grep.

**Negativas:** exige disciplina — novas telas devem consumir tokens e primitivas (revisão de PR deve
barrar cor crua/componente ad-hoc); a paleta de acento de consulta fica propositalmente enxuta.

**Neutras:** valores legados de `EventTypeColor = VIOLET|FUCHSIA` eventualmente persistidos caem no
fallback Teal na renderização (sem migração de dados obrigatória).
