# MarcaAí — Plano interno (estrutura e funcionalidade, sem depender de contas)

> Complementa `PLANO_DE_VENDA.md`: enquanto o dono abre as contas externas (V3–V5), este plano melhora **o que já é nosso**: confiabilidade, desempenho, funcionalidades que o profissional espera de uma agenda de saúde, qualidade do front, LGPD/segurança internas e operação.
> Convenções: ✅ pronto · ⬜ a fazer · 🧑 depende do dono. **Nada aqui exige Stripe, Resend, Google, domínio ou advogado** — tudo é provado com Postgres/Mailpit/pagamento simulado/e-mail capturado.
> Regras de trabalho: `CLAUDE.md`. Cada fase termina com `./build.sh` + E2E verdes, docs atualizados, commits pequenos e **parada para reportar**.

## 0. Ponto de partida (o que foi observado)
Pontos fracos reais, vistos no código e nos testes:
1. **E-mails e notificações são "melhor esforço" inline**: se o envio falha, a notificação some (sem fila, sem nova tentativa).
2. **O dashboard não tem uma agenda de verdade**: só lista de consultas (sem visão dia/semana), e o sino de notificações é decorativo.
3. `GET /bookings` e a lista de pacientes **não paginam** (pacientes lê até 5.000 linhas na memória).
4. `/health` é estático (não verifica banco nem jobs) e não há métricas.
5. Lembrete só **2 h antes**; confirmação do paciente e marcação de falta (no-show) não existem.
6. Sem trilha de auditoria de acesso a dado de paciente (LGPD pede responsabilização).
7. Validação local depende de lembrar de rodar vários comandos (CI desligado); sem hooks nem verificação única.
8. CSP com `unsafe-inline`; favicon/OG genéricos; sem PWA.

## 1. Fases (ordem recomendada)

### I1 — Fundação de engenharia (verificação única, higiene, saúde do serviço)
Objetivo: qualquer mudança futura é validada com **um comando**, e o serviço diz a verdade sobre si mesmo.
- ✅ `scripts/verify.sh` (e `verify.ps1`): build + testes backend/front + lint + E2E (build de produção) + varredura de segredos + auditoria de dependências; saída resumida e código de saída correto. Opção `--fast` (sem E2E) e `--no-docker`.
- ✅ Hook de **pre-push** (instalável por `scripts/install-hooks.sh`) rodando `verify --fast`; hook de **pre-commit** com varredura de segredos (padrões `sk_live_`, `AGE-SECRET-KEY`, `whsec_`, `re_…`, `.env`, dumps).
- ✅ `GET /health/live` (processo) e `GET /health/ready` (banco responde, migrations aplicadas, Hangfire vivo); o compose usa `ready`.
- ✅ Log **estruturado** (JSON) com `traceId` em toda linha e nos ProblemDetails; nível por ambiente; sem dado pessoal (revisão dos `LogInformation` existentes).
- ✅ Desligamento limpo (SIGTERM: termina requisições e jobs em curso) e teste de que as migrations não deixam o modelo defasado (`dotnet ef migrations has-pending-model-changes` no `verify`).
- ✅ Higiene: eliminar os 5 avisos de lint, remover código e docs mortos (NextAuth, specs obsoletas), `npm audit` / `dotnet list package --vulnerable` sem alto/crítico (ou registrados), atualizar dependências com patch seguro. _(feito: lint com zero avisos e exigido no verify; `noUnusedLocals` ligado; 2 docs mortos removidos; specs históricos ainda referenciados ficaram — ver PENDENCIAS; 8 avisos moderados do npm são só da cadeia do eslint, registrados; .NET sem vulnerabilidade e só com majors pendentes)_
- **Aceite:** `scripts/verify.sh` verde do zero; `/health/ready` fica 503 com o Postgres parado e volta sozinho; hooks instalados e testados.

### I2 — Backend: confiabilidade e desempenho
Objetivo: nenhuma notificação se perde; listas escalam; leituras públicas ficam baratas.
- ⬜ **Outbox de notificações**: tabela `outbox_messages` (tipo, destinatário, payload sem dado desnecessário, tentativas, próxima tentativa, estado); `NotificationService` grava na mesma transação; um job drena com **retry exponencial** e **dead-letter** visível no `/admin`. Testes: falha do e-mail → reenvia; sucesso não duplica; consulta cancelada antes do envio não notifica.
- ⬜ **Paginação** por cursor/offset em `GET /bookings` e `GET /patients` (com `total`, filtro por período/status/busca no servidor); o front pagina e filtra.
- ⬜ **Cache** de `GET /public/{user}` e `GET /slots/month` (`IMemoryCache` com expiração curta e **invalidação** ao salvar agenda/serviço/consulta); métricas de acerto. Prova no teste de carga (`docs/load-test.md`).
- ⬜ **Idempotência** em `POST /bookings` (cabeçalho `Idempotency-Key` do front, protegendo duplo clique/retry de rede) e `POST /bookings/{uid}/pay`.
- ⬜ Revisão de índices e N+1 com `EXPLAIN` nas consultas quentes (slots, lista de consultas, pacientes, financeiro); migrations de índice quando houver ganho medido.
- ⬜ Resiliência dos jobs: retries do Hangfire configurados, jobs idempotentes, painel do `/admin` mostrando fila/falhas.
- **Aceite:** teste que derruba o envio de e-mail e prova a entrega posterior; listas com 10 mil linhas respondem < 200 ms; carga de leitura sem regressão (e melhor no cache); nenhum 5xx no teste de carga.

### I3 — Produto: o que um profissional de saúde espera de uma agenda
Objetivo: o dia a dia do consultório funciona sem sair do MarcaAí.
- ⬜ **Agenda visual** no dashboard: visão **dia e semana** (grade por horário, cores por serviço, clique abre a consulta, remarcar/cancelar/aprovar ali), responsiva.
- ⬜ **Lembretes configuráveis**: 24 h e 2 h antes (padrão), por e-mail; ligado/desligado por serviço; texto sem dado clínico. Prova com e-mail capturado.
- ⬜ **Anexo `.ics`** nos e-mails de confirmação e remarcação (estender `IEmailClient` para anexos; Mailpit/SMTP local prova).
- ⬜ **Confirmação de presença** pelo paciente (link no lembrete: "vou comparecer / preciso remarcar") e **marcar falta (no-show)** pelo profissional, com métricas no painel.
- ⬜ **Política por serviço**: antecedência mínima para agendar, prazo de cancelamento/reembolso e mensagem exibida ao paciente (hoje a regra de 24 h é fixa).
- ⬜ **Notificações no app** reais (o sino hoje é decorativo): novas consultas, cancelamentos, remarcações, pagamentos; marcar como lida.
- ⬜ **Onboarding guiado** no dashboard: checklist (perfil, serviço, horários, compartilhar link, [recebimentos]) com progresso; **compartilhar** link (copiar, WhatsApp, QR code).
- ⬜ **Exportações** em CSV: consultas e financeiro por período (respeitando LGPD: só dados do próprio profissional).
- ⬜ Backlog (decidir com dados do beta): lista de espera, várias agendas por profissional, página pública da clínica (D4), consultas recorrentes.
- **Aceite:** E2E cobre agenda semanal, lembrete 24 h capturado, `.ics` válido, confirmação de presença e no-show; checklist some quando tudo está feito.

### I4 — Frontend: qualidade, desempenho e acabamento
Objetivo: interface consistente, rápida e acessível em todas as telas (não só nas públicas).
- ⬜ Estados de **carregando, vazio e erro** em toda página do dashboard; toasts consistentes; formulários com validação inline e foco no primeiro erro.
- ⬜ Dashboard no **celular** (navegação, tabelas viram cartões, agenda legível) — verificado em 375 px por E2E/visual.
- ⬜ **Acessibilidade** (axe) estendida a todas as páginas do dashboard e às configurações; navegação por teclado nos fluxos principais.
- ⬜ **Desempenho**: análise de bundle, `next/image`, carregamento sob demanda, meta de Lighthouse ≥ 90 (desempenho/acessibilidade/SEO) nas páginas públicas; orçamento de bundle no `verify`.
- ⬜ **Identidade**: favicon e imagem OG próprios (SVG/PNG gerados no repositório), `manifest` + ícones (PWA instalável), `theme-color` coerente.
- ⬜ **CSP com nonce** (remover `unsafe-inline`), com teste que garante cabeçalhos.
- ⬜ Testes de componente (Testing Library) para `booking-form`, `calendar-picker`, `payment-client`, `reschedule-client`; remover `any`/`as never` dos testes novos e do código.
- ⬜ Documento curto de **design system** (tokens, componentes, regras de contraste) a partir de `docs/adrs/0006`.
- **Aceite:** axe sem violação grave em todas as rotas; Lighthouse ≥ 90 nas públicas; sem `unsafe-inline` na CSP; E2E em 375 px.

### I5 — LGPD e segurança internas
Objetivo: responsabilização e defesa em profundidade, sem depender de jurídico externo para o que é técnico.
- ⬜ **Trilha de auditoria** (skill `lgpd-audit-logging`): quem acessou/exportou/anonimizou/excluiu dado de paciente e quando (sem o conteúdo), imutável e consultável pelo dono; retenção definida.
- ⬜ **Direitos do titular de ponta a ponta**: fluxo para o **paciente** pedir cópia/correção/exclusão (página pública com verificação por e-mail do próprio paciente), com prazo de 15 dias rastreado no `/admin` (skill `lgpd-dsar`).
- ⬜ **Ledger de consentimento** versionado (aceite por versão do aviso; novo aceite quando a política mudar).
- ⬜ **Rascunhos técnicos** (sem valor jurídico até o advogado revisar): RIPD, ROPA, runbook de incidente com os campos exigidos, atualizados a partir do código (skills `lgpd-ripd`, `lgpd-ropa`, `lgpd-incident-response`, `lgpd-data-mapping`); `.lgpd/gaps.md` zerado nos itens técnicos.
- ⬜ **Sessões**: listar/revogar sessões ativas, expiração de refresh, limite de tentativas no verify do magic link, rate limit por usuário (além de por IP).
- ⬜ **Cifra** de campos sensíveis de texto livre (`GuestNotes`, respostas do formulário) em repouso, com chave do Data Protection e plano de rotação.
- ⬜ Testes de **autorização** sistemáticos (matriz papel × rota × recurso) e fuzz leve de entrada nas rotas públicas.
- **Aceite:** toda leitura/exportação de paciente gera evento de auditoria; paciente consegue pedir seus dados sem login; matriz de autorização verde; `.lgpd/gaps.md` sem item técnico aberto.

### I6 — Operação e observabilidade
Objetivo: o dono enxerga a saúde do sistema e confia no backup sem ação manual.
- ⬜ **Métricas** em `/metrics` (Prometheus, protegido) — requisições, latência, jobs, fila do outbox, erros — e gráficos simples no `/admin`.
- ⬜ **Alertas por webhook genérico** (`ALERT_WEBHOOK_URL`, opcional): erros em alta, fila do outbox travada, disco baixo, backup atrasado. Sem exigir conta específica (Telegram/Slack/e-mail apontam para o webhook depois).
- ⬜ **Verificação automática do backup**: o container de backup restaura o dump mais recente num banco temporário toda semana, confere contagens/migrations e registra o resultado (e alerta se falhar).
- ⬜ **Vigia de disco** e limpeza segura de imagens/volumes (o PC tem pouco espaço).
- ⬜ Exercitar a **falha do deploy** (build quebrado, migration falha, API não sobe) e provar o rollback do `scripts/deploy.ps1`; documentar migração reversível (expand/contract).
- ⬜ **Caos leve**: derrubar a API durante agendamentos, derrubar o Postgres e voltar, repetir o teste de carga — sem perda de consulta e sem duplicidade.
- **Aceite:** `/metrics` e gráficos funcionando; backup restaurado automaticamente com relatório; rollback provado; teste de caos verde.

## 2. Riscos e decisões
| Item | Observação |
|---|---|
| Outbox muda o contrato das notificações | Migrar uma notificação por vez; manter testes de e-mail capturado |
| Cache pode servir dado velho | Invalidar nos pontos de escrita e testar; TTL curto |
| Agenda visual é a maior mudança de UX | Validar com o dono antes de polir; começar por leitura (dia/semana) e depois ações |
| Cifra de campos | Planejar rotação de chave antes de ligar; não perder dados existentes (migração em lote) |
| 🧑 Decisões a levar ao dono | Texto das políticas por serviço; se lembrete de 24 h vem ligado por padrão; se o paciente pode se confirmar/recusar por link; escopo da exportação CSV |

## 3. Registro de execução
| Fase | Início | Fim | Resultado | Desvios |
|---|---|---|---|---|
| I1 | 09/11/2026 | 09/11/2026 | `scripts/verify.sh` verde do zero (14 passos, ~160 s): 92 unit + 69 integração (backend), 130 unit (front), E2E Playwright, lint sem avisos. Hooks testados (pre-commit barra segredo falso). `/health/ready` 503 com o Postgres parado e volta sozinho (provado com a API real). SIGTERM no container: saída 0 em < 2 s. | O teste do formatter de log achou um vazamento real: a `Message` do `PostgresException` traz o DETAIL com valores de colunas (também ia para `error_events`) → `SafeException`. O scanner de segredos reimprimia parte da chave → corrigido (só arquivo:linha). Não provado: drenagem de requisição/job **em curso** no SIGTERM (só o desligamento limpo ocioso); pre-push executado direto (`.githooks/pre-push`, verde em 108 s) e o caminho de pular; não rodei um `git push` de verdade (sem push, por regra). |
| I2 | | | | |
| I3 | | | | |
| I4 | | | | |
| I5 | | | | |
| I6 | | | | |
