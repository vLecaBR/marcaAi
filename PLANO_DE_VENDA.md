# MarcaAí — Plano de ação para começar a vender

> Continuação do `PLANO_DE_LANCAMENTO.md` (fases F0–F10, que cuidam da **infraestrutura e da base técnica**). Este documento cuida do que falta para o produto **ser vendável**: regras de negócio, contas externas, jurídico, beta e lançamento. Baseado na verificação ponta a ponta de 07/11/2026 (`docs/verificacao-ponta-a-ponta.md`).
> Convenções: 🤖 = eu executo no repositório · 🧑 = depende de você (conta, decisão, dinheiro, advogado) · ⏱ = prazo de calendário, não de trabalho.
> Regras de trabalho continuam as mesmas: fase a fase, verificar, atualizar docs, parar e reportar; nada de segredo no git; LGPD em cada fase.

## 0. Veredito honesto

| Pergunta | Resposta |
|---|---|
| Funciona como **agenda online pública** para profissionais de saúde? | **Sim.** Cadastro → configuração → paciente agenda pelo celular com consentimento → e-mails → cancelamento. Testado (E2E, integração, navegador). |
| Funciona como **"agendar e receber"** (a promessa da landing)? | **Ainda não.** Pagamento nunca rodou com provedor real e há um buraco de regra (consulta paga fica confirmada sem pagar). |
| Pode ser **hospedado** no PC? | **Sim** (stack de produção, backup e restauração testados) — mas o PC é ponto único de falha; ver V4. |
| Posso **divulgar** hoje? | Como **lista de espera / beta fechado com agenda gratuita**, só depois de V3 (e-mail real) + V4. **Cobrar**, só depois de V1 + V3 + V5. |

O que mais atrasa **não é código**: é o que depende de terceiros (verificação do Google, ativação do Stripe, domínio e DNS do e-mail, advogado). Por isso a seção 1 vem primeiro: **comece essas esperas hoje** enquanto eu trabalho em V1/V2.

## 1. Caminho crítico externo — comece hoje 🧑

| # | Item | Prazo típico ⏱ | Bloqueia |
|---|---|---|---|
| E1 | Comprar o **domínio** e colocar na Cloudflare | 1 dia | tudo online |
| E2 | **Resend**: conta + verificar domínio (SPF/DKIM/DMARC) | 1–2 dias | login de qualquer usuário (a API prod não sobe sem ele) |
| E3 | **Google Cloud Console**: projeto, tela de consentimento, login publicado e **submeter a verificação** do escopo `calendar.events` | **semanas** (revisão do Google) | Google Agenda/Meet para usuários externos |
| E4 | **Stripe Brasil**: conta ativada (verifique com eles se exige CNPJ), Connect habilitado, produtos/preços | dias a semanas | pagamentos e assinatura do SaaS |
| E5 | **Mercado Pago** (PIX): aplicação + credenciais (opcional no lançamento, D7) | dias | PIX |
| E6 | **Advogado** de proteção de dados/saúde: termos, privacidade, contrato de operador (ver V5) | 1–3 semanas | cobrar e coletar dado de paciente em produção |
| E7 | **Contador / CNPJ ou MEI**: como emitir nota da mensalidade e da taxa da plataforma; tributação do repasse | 1–2 semanas | cobrar |
| E8 | **Cloudflare R2** (ou B2): bucket privado + token para backup | 1 dia | backup externo |
| E9 | Monitor externo (UptimeRobot/Better Stack) + e-mail/Telegram de alerta | 1 hora | operação |
| E10 | **Número de WhatsApp Business** (ou e-mail) só para suporte | 1 dia | beta |
| E11 | Lista de **3–5 profissionais conhecidos** para o beta (psicólogo, nutri, fisio, dentista…) | contínuo | V6 |

## 2. Fases

### V1 — Fechar os buracos do produto 🤖 (offline, sem contas externas)
Objetivo: a promessa da landing passa a valer em todos os caminhos, testável sem Stripe.

- [ ] **Regra de cobrança** (decidir D14 antes). Recomendado: serviço **gratuito** confirma na hora; serviço **pago** cria reserva `PENDING_PAYMENT` que **segura o horário por 15 min**, confirma quando o webhook baixa o pagamento e **libera sozinha** se expirar (job). Opção por serviço "pagar no local" (sem cobrança online) para quem não quer/não pode cobrar online.
- [ ] **Validação no cadastro do serviço**: não permite preço > 0 sem conta de recebimento ativa (API 422 + aviso na tela com botão "Ativar recebimentos").
- [ ] E-mails e telas falam de pagamento (valor, prazo para pagar, "horário reservado até HH:MM").
- [ ] **Provedor de pagamento falso** (`Payments:Provider=Fake`, só em Development/Test; o `ProductionConfigValidator` recusa em produção) para testar a jornada paga inteira offline (reserva → pagar → confirmar → expirar → reembolsar) em integração e E2E.
- [ ] **Remarcar**: paciente pelo link da consulta e profissional pelo dashboard; reutiliza o guard anti-double-booking; e-mails de remarcação; atualiza Google Agenda; regra D15 (ex.: até 24 h antes, máx. 2 vezes).
- [ ] **Consulta online**: tipo online exige link (campo manual) ou Google conectado; sem nenhum dos dois, o salvamento avisa.
- [ ] **Lista de pacientes** (derivada das consultas): contato, histórico, total pago, busca funcionando no topo, "anonimizar" reaproveitando o endpoint LGPD. **Sem prontuário/anotação clínica** (D16: outro universo regulatório — CFM/CFP).
- [ ] Calendário público só habilita dias com agenda e horários futuros (endpoint de disponibilidade do mês).
- [ ] Anexo `.ics` no e-mail de confirmação.
- [ ] Revisão de texto: "serviço/consulta" em vez de "evento/reunião"; marca "MarcaAí"; domínio vindo de `NEXT_PUBLIC_APP_URL` (não `marcaai.app` fixo); mock da landing com data dinâmica; tela de planos coerente durante o trial; páginas 404/erro; favicon, meta/OG; `robots`/`sitemap` (páginas `/booking/{uid}` com `noindex`).
- [ ] Textos de marketing sem promessa de resultado clínico (regras de publicidade dos conselhos) — o advogado confirma em V5.

**Aceite:** nenhum caminho deixa consulta paga confirmada sem pagamento; paciente remarca sozinho; profissional enxerga e busca pacientes; `./build.sh` + E2E verdes, incluindo a jornada paga com o provedor falso.

### V2 — Qualidade e robustez 🤖 (offline)
- [ ] E2E contra **build de produção** (`next build && next start`), não `next dev`; roda também contra a stack do compose de produção.
- [ ] **Teste de carga** (k6): 50 agendamentos simultâneos, página pública a ~100 req/s; dimensiona se o PC aguenta e ajusta o pool do Postgres/Hangfire. Meta: sem erro 5xx, p95 < 500 ms nas rotas públicas.
- [ ] **Lembrete real**: disparar o job com horário ajustado e ver o e-mail de lembrete chegar (hoje só teste de unidade); idem lembrete de pós-consulta/no-show se existir.
- [ ] Teste automatizado de **rate limit** e de **expiração de trial**.
- [ ] Cobertura do front ≥ 70% em `lib/` e hooks; acessibilidade (axe) nas telas públicas e no onboarding.
- [ ] Achados #16 (consulta/cancelamento por uid adivinhável → token longo/assinado) e #17 (antiforgery do BFF) fechados e testados.
- [ ] **Rastreio de erros** (Sentry free ou GlitchTip self-hosted) no front e na API, **sem dado pessoal** nos eventos (LGPD); logs estruturados e retenção definida.
- [ ] Painel mínimo do dono (`/admin`, só seu usuário): cadastros, onboardings concluídos, consultas por dia, erros recentes.
- [ ] Reativar o CI quando houver minutos (ou rodar o workflow localmente).

**Aceite:** relatório de carga no `docs/`; zero P0/P1 abertos; rastreio de erros recebendo um erro de teste.

### V3 — Contas e provedores reais em modo teste 🧑 + 🤖
Depende de E1–E5 e E8.
- [ ] 🤖 Ligar e **provar** cada integração (registrar no §9 do plano):
  - [ ] **E-mail**: magic link e confirmações chegando na **caixa de entrada** (Gmail/Outlook) e nota boa no mail-tester; DMARC alinhado.
  - [ ] **Stripe (teste)**: onboarding Connect do profissional → pagamento com cartão de teste → webhook → repasse com a taxa certa → **reembolso** → assinatura do plano (checkout, trial → Solo, upgrade/downgrade, cancelamento); rodar **todo** o `docs/test-checklist.md`.
  - [ ] **PIX (Mercado Pago sandbox)**, se D7 incluir.
  - [ ] **Google**: login, conectar Agenda, evento criado e link do Meet na consulta.
- [ ] 🧑 Submeter a verificação do Google o quanto antes (E3); enquanto isso o app roda em modo "teste" com até 100 usuários cadastrados.

**Aceite:** checklist de teste 100% verde com provedores reais em modo teste, anexado ao §9.

### V4 — Go-live técnico 🤖 + 🧑
Complementa F9/F10.
- [ ] Domínio no ar pelo túnel; **teste no 4G**: cadastrar → agendar → pagar (teste) → e-mail; **reiniciar o PC** e a stack volta sozinha.
- [ ] Segredos de produção novos (rotação completa) e `.env.prod` guardado no cofre; chave `age` do backup fora do PC.
- [ ] Backup diário no R2 **e restauração a partir do R2** documentada; alerta de "backup não rodou" (heartbeat).
- [ ] **ZAP baseline** contra o app no ar, correções, CSP com nonce se viável.
- [ ] Windows 24/7 (energia, login automático, BitLocker, nobreak) conforme `docs/deploy-self-host.md`; monitor externo ligado.
- [ ] Stripe em **live** só depois de V5; webhooks live; um pagamento real pequeno de ponta a ponta e estornado.
- [ ] **Plano B de hospedagem**: o mesmo `docker-compose.prod.yml` roda em um VPS (custo de dezenas de reais/mês). Critério para migrar: ao ter clientes pagantes com expectativa de disponibilidade, ou quando a média de quedas do PC passar do combinado no beta. Ensaiar a migração uma vez (restaurar o backup num VPS de teste).

**Aceite:** os critérios de aceite da F9 e F10 do plano original + restauração a partir do R2.

### V5 — Jurídico, LGPD e fiscal 🧑 + 🤖 (em paralelo desde o dia 0)
- [ ] 🤖 Rodar `lgpd-ripd`, `lgpd-ropa`, `lgpd-incident-response`, `lgpd-dpa`, `lgpd-vendor-audit` e `lgpd-international-transfer` (Stripe, Resend, Cloudflare, Google); fechar `.lgpd/gaps.md`.
- [ ] 🤖 Minutar o **contrato/termo de operador** entre cada profissional (controlador dos dados do paciente) e o MarcaAí (operador), mais política de retenção, subprocessadores e canal de titulares.
- [ ] 🧑 Advogado revisa: `/privacidade`, `/termos`, contrato de operador, política de cancelamento/reembolso (D6), cláusulas de intermediação de pagamento, textos de marketing.
- [ ] 🧑 D13: encarregado designado e `DPO_EMAIL` ativo; D10: retenção definida.
- [ ] 🧑 Contador: emissão de nota da mensalidade e da taxa; tratamento do repasse; regime tributário.
- [ ] 🤖 Remover o aviso "versão preliminar" e atualizar `Privacy__PolicyVersion` quando o texto final sair.

**Aceite:** `.lgpd/STATUS.md` sem pendência crítica, textos publicados com versão, contrato de operador aceito no cadastro do profissional.

### V6 — Beta fechado 🧑 + 🤖 (2–4 semanas ⏱)
- [ ] 3–5 profissionais (E11) com onboarding assistido; suporte pelo WhatsApp/e-mail do E10, visível no dashboard.
- [ ] Métricas de ativação: onboarding concluído, 1ª consulta agendada em 7 dias, cancelamentos, faltas, pagamentos.
- [ ] Triagem semanal de bugs; 🤖 correções rápidas (hotfix com `deploy.ps1`).
- [ ] Validar **preço e taxa** (a taxa de 10% do plano grátis e as mensalidades são hipóteses, não fatos) e o trial de 30 dias sem cartão (D5).
- [ ] Coletar 2–3 depoimentos autorizados (por escrito, LGPD/ética profissional).

**Saída do beta (todos):** ≥ 3 profissionais com ≥ 10 consultas reais cada; ≥ 1 pagamento real por profissional; 14 dias sem bug P0; nenhum incidente de dados; indisponibilidade dentro do combinado.

### V7 — Lançamento comercial 🧑 + 🤖
- [ ] Landing final (depoimentos, FAQ, contato, preço validado), SEO básico, perfil no Google Meu Negócio, Instagram/LinkedIn; página de status.
- [ ] Sequência de e-mails de ativação (dia 0, 3, 7) pelo Resend; "convide um colega".
- [ ] Cobrança live do SaaS ligada; política de suporte e prazo de resposta publicados.
- [ ] Aquisição inicial: indicação dos beta testers, grupos/associações do conselho profissional (respeitando as regras de publicidade), conteúdo.
- [ ] Revisão de 30 dias: métricas, churn, custo de suporte, decisão sobre VPS.

**Backlog pós-lançamento (priorizar com dados do beta):** lembretes por WhatsApp (Evolution, D8), página pública da clínica (D4), relatórios e exportações, NFS-e automática, app instalável (PWA), pacote de pacientes (importação), prontuário **só** com estudo regulatório próprio.

## 3. Decisões do dono 🧑 (novas)

| # | Decisão | Recomendação | Fase |
|---|---|---|---|
| D14 | Regra de cobrança de consulta paga | Pagar para confirmar, reserva de 15 min; opção "pagar no local" | V1 |
| D15 | Política de remarcação | Até 24 h antes, até 2 vezes, sem custo | V1 |
| D16 | Escopo de "pacientes" no MVP | Lista + histórico de consultas; **sem prontuário** | V1 |
| D17 | Consulta online sem Google | Link manual obrigatório (Meet/Zoom/Teams do próprio profissional) | V1 |
| D18 | Validar preços e a taxa de 10% no beta | Sim; mudar antes do lançamento se o beta mostrar atrito | V6 |
| D19 | Entidade jurídica para cobrar (CNPJ/MEI) | Definir com o contador antes do Stripe live | V5 |
| D20 | Hospedagem após o beta | Manter no PC só enquanto não houver cliente pagante com expectativa de SLA | V4/V7 |

## 4. Ordem e linha do tempo (estimativa)

```
Semana 0     🧑 E1–E11 (começar as esperas)          🤖 V1
Semanas 1–2  🧑 E6/E7 em andamento                    🤖 V2 (+ V5 minutas)
Semanas 2–4  🧑 contas prontas → 🤖 V3 (provas reais) 🧑 advogado revisa
Semanas 4–5  🤖 V4 (go-live técnico, ZAP, R2, 4G)
Semanas 5–9  V6 beta fechado (2–4 semanas)
Semana 9+    V7 lançamento comercial
```
É uma estimativa: o calendário é dominado por E3/E4/E6 (terceiros). Sem pressa de código, **a pressa é abrir as contas**.

## 5. Definição de "pronto para vender" (checklist final)
- [ ] Nenhum caminho confirma consulta paga sem pagamento; pagamento, reembolso e assinatura provados com os provedores reais.
- [ ] E-mails chegam na caixa de entrada; login funciona para qualquer pessoa (Google verificado ou só magic link).
- [ ] Paciente agenda, remarca e cancela sozinho; profissional gerencia agenda, pacientes e recebimentos.
- [ ] Domínio próprio, HTTPS, backup externo **restaurado** com sucesso, monitor externo, rastreio de erros.
- [ ] Textos legais finais revisados por advogado; contrato de operador; encarregado; RIPD/ROPA.
- [ ] Contador definiu como cobrar e emitir nota.
- [ ] Beta concluído com os critérios de saída; canal de suporte funcionando.
- [ ] Segredos rotacionados; ZAP sem achado alto/crítico; carga testada.

## 6. Riscos principais
| Risco | Mitigação |
|---|---|
| Verificação do Google demora/nega | Lançar só com magic link e Meet/Zoom manual; Google Agenda vira recurso posterior |
| Stripe Connect BR exigir requisitos que a conta não atende | Descobrir já (E4); plano B PIX/Mercado Pago ou cobrança "no local" |
| PC cai durante horário de atendimento | Nobreak, monitor, runbook; migração para VPS ensaiada (V4) |
| Dado de saúde em produção sem base jurídica sólida | Não cobrar nem abrir antes de V5; começar o beta só com contrato de operador aceito |
| Preço/taxa mal calibrados | Validar no beta (D18) antes de divulgar preços |
| Dependência de um único mantenedor | Documentação (`docs/runbook.md`), `.env.prod` e chave de backup no cofre, repositório com bus-factor ≥ 2 de acesso |

## 7. Registro de execução
| Fase | Início | Fim | Resultado | Desvios |
|---|---|---|---|---|
| V1 | | | | |
| V2 | | | | |
| V3 | | | | |
| V4 | | | | |
| V5 | | | | |
| V6 | | | | |
| V7 | | | | |
