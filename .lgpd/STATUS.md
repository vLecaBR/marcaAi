# LGPD Audit Status

**Projeto**: MarcaAí · **Cenário**: C (híbrido) · **Início**: 06/11/2026 · **Última atualização**: 06/11/2026 (F4)
**Encarregado**: pendente designação (D13)

## Pipeline atual (gate da F1 — linha de base)
- [x] Setup `.lgpd/`
- [x] Gap analysis de linha de base → `gaps.md` (19 gaps: 6 críticos, 8 altos, 5 médios)
- [x] Data mapping reverso do código → `data-map.md` (12 atividades; A004/A009/A012 sensíveis/alto risco)
- [ ] Base legal (`lgpd-legal-basis`) — F7
- [ ] ROPA / RIPD / Política / Encarregado — F7 ⏸ (checkpoints, revisão jurídica)
- [ ] DSAR, consentimento, retenção — F4
- [ ] Operadores / DPAs / transferência internacional — F5/F6
- [ ] Incidentes (runbook) — F7/F9

## Artefatos gerados
- `.lgpd/data-map.md` — v0.1, 06/11/2026
- `.lgpd/gaps.md` — v1, 06/11/2026

## Resumo
Não é possível receber pacientes reais hoje: há dado de saúde sem política, termos, base legal, consentimento nem canal do titular, e a landing afirma conformidade. O gate da F10 permanece **NO-GO** até fechar os gaps críticos.

## Atualização F4 (06/11/2026)
Entregues: consentimento no agendamento (G04 parcial), exportar/anonimizar paciente e exportar/excluir conta (G03 parcial), `data-map` v0.2.
Pendente: política/termos revisados (G01/G02), retenção (G08), ROPA/RIPD/encarregado (F7).

## Próximo passo
F2 (sem impacto LGPD novo). Na F3, fechar G05/G06/G07. Decidir D13 e G01.
