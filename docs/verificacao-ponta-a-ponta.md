# Verificação ponta a ponta (07/11/2026, ao fim da F9)

Pergunta: **o MarcaAí cumpre o seu papel** (agendar pacientes e receber), mesmo offline, e o que falta para vender?

Método: (1) suíte automatizada completa (`./build.sh` + E2E Playwright); (2) stack de **produção** (`docker-compose.prod.yml`) construída e exercitada localmente; (3) percurso manual no navegador como profissional e como paciente, em desktop e celular; (4) leitura do código dos fluxos para achar o que **não existe**. Nada disso usou provedores reais (Stripe, Mercado Pago, Resend, Google): o que depende deles está marcado como **não verificado**.

## Resultado em uma frase
**Funciona como agenda online pública com consentimento LGPD** (profissional se cadastra, configura, o paciente agenda pelo celular, ambos recebem e-mail, cancelamento libera o horário). **Ainda não funciona como "agendar e receber"**: o pagamento nunca foi exercitado com provedor real e há um buraco de regra de negócio na cobrança (abaixo). Também faltam itens que o mercado espera de uma agenda de saúde (remarcar, lista de pacientes) e todas as contas/serviços externos.

## Matriz do que foi verificado

| Fluxo | Como foi verificado | Resultado |
|---|---|---|
| Landing, planos, termos, privacidade | Navegador + E2E | ✅ (texto do mock da landing mostra "Maio 2026") |
| Login por magic link (uso único, e-mail) | Navegador (e-mail no Mailpit) + E2E + integração | ✅ |
| Onboarding 3 passos (identidade, link, fuso) | Navegador | ✅ cria agenda padrão seg–sex 09–18 |
| Tipos de consulta (CRUD, preço, buffers) | Navegador + API | ✅ |
| Disponibilidade e exceções | Navegador + testes de agenda (99,5%) | ✅ |
| Página pública do profissional e do serviço | Navegador, **celular 375px** | ✅ layout bom no celular |
| Agendar como paciente, com consentimento obrigatório | E2E + integração + navegador | ✅ |
| Concorrência (6 pessoas no mesmo horário) | Integração | ✅ após correção do bug de double-booking (F8) |
| E-mails de confirmação ao paciente e aviso à profissional | Mailpit | ✅ |
| Cancelamento libera o horário | E2E + integração | ✅ |
| Direitos do titular (exportar/anonimizar/excluir) e retenção | Integração (gate LGPD) | ✅ |
| Times e papéis, IDOR de payouts | Integração | ✅ |
| Webhooks do Stripe (assinatura, idempotência) | Integração com eventos assinados **simulados** | ✅ simulado · ⚠️ nunca com o Stripe real |
| Stack de produção (3 imagens, ~220 MB de RAM, health, restart, volumes) | `docker-compose.prod.yml` real | ✅ |
| Backup criptografado + **restauração** em banco de teste | Backup real e `restore-backup.ps1` (5 migrations, 18 tabelas) | ✅ |
| Deploy com tag por commit e rollback | `scripts/deploy.ps1` | ✅ deploy · ⚠️ caminho de falha forçada não exercitado |
| Cloudflare Tunnel | Depende do seu domínio/token | ⛔ não verificado |
| Pagamento (cartão/PIX), repasse, reembolso | Sem contas Stripe/MP | ⛔ não verificado |
| E-mail real (Resend, domínio verificado, caixa de entrada) | Sem conta/domínio | ⛔ não verificado (a API prod nem sobe sem isso) |
| Login com Google e Google Agenda/Meet | Sem credenciais | ⛔ não verificado |
| Lembretes (job a cada 15 min) | Só teste unitário/integração do job | ⚠️ não vi um lembrete real chegar |
| Assinatura do próprio SaaS (checkout de plano, fim do trial) | Sem Stripe | ⛔ não verificado |

## Achados do percurso (para o plano de venda)

**Bloqueadores de negócio**
1. **Buraco na cobrança.** É possível publicar um serviço com preço (R$ 150) **sem ter conta de recebimento ativa**; o paciente agenda, a consulta fica **CONFIRMADA sem pagar**, e o botão de pagar responde "o profissional ainda não concluiu o cadastro de recebimentos". Não existe reserva pendente de pagamento nem expiração de reserva não paga, e o e-mail de confirmação não fala de pagamento. Precisa de uma regra clara (pagar para confirmar × pagar depois/no local) e de validação no cadastro do serviço.
2. **Não há como remarcar.** O paciente só cancela (o status `RESCHEDULED` existe no enum, sem fluxo). Remarcação é a ação mais comum numa agenda de saúde.
3. **Nenhum provedor real foi exercitado** (pagamento, e-mail, Google). É o maior risco técnico remanescente.

**Importantes**
4. Não há lista/histórico de pacientes (só consultas); o campo de busca do topo do dashboard é apenas visual (sem lógica).
5. Serviço "Google Meet" (padrão) sem Google conectado nem link manual gera consulta **sem link**; o paciente não recebe como entrar.
6. Tela de planos mostra "Solo — plano atual" durante o trial de 30 dias (que libera recursos do Solo Pro).
7. Domínio fixo `marcaai.app/` exibido no onboarding e na página pública, independente do domínio real de produção.
8. Calendário público habilita fins de semana e o dia de hoje sem agenda (já registrado na F8).
9. Linguagem de agenda genérica em alguns pontos ("Novo tipo de evento", "reuniões") num produto de saúde; marca escrita "Marca Ai" em telas.
10. Sem painel administrativo seu (quantos cadastros, quem travou no onboarding), sem rastreio de erros em produção, sem canal de suporte visível.

**Pequenos (já anotados)**: CSP sem nonce; antiforgery do BFF não validado de ponta a ponta (#17); achado #16; `ProductionConfigValidator` rejeita chave JWT que contenha "dev", "secret" ou "changeme" mesmo ao acaso (probabilidade ~0,3%: se o boot reclamar, gere outra).

## Atualização — V1 (07/11/2026)
Resolvidos no código e cobertos por testes: achados **1** (cobrança: pagar para confirmar com reserva de 15 min, expiração, reembolso tardio, pagar no local, bloqueio de preço sem recebimento), **2** (remarcar), **4** (lista de pacientes e busca), **5** (link online obrigatório), **6** (plano durante o trial), **7** (host vindo da configuração), **8** (calendário só com dias livres) e **9** (linguagem de saúde e marca "MarcaAí"). Também corrigido: a API aceitava agendar **no passado** e além do limite de dias. Continuam em aberto: provedores reais (achado 3 → V3), painel do dono e rastreio de erros (achado 10 → V2).

## Atualização — V2 (08/11/2026)
Fechados: achado **10** (painel do dono em `/admin` e captura de erros sem dado pessoal; falta só alerta ativo e o monitor externo), os achados pequenos **#16** (uid previsível) e **#17** (CSRF), e as dúvidas de **lembrete** (provado com e-mail capturado), **rate limit** e **fim do trial** (testes automatizados). Medido: acessibilidade (axe) sem violações graves nas telas principais, cobertura do front 93%, E2E em build de produção (8/8, ~1 min) e carga (API 2,3 mil req/s; 30 pacientes no mesmo horário → 1 vence). Continuam **não verificados**: pagamento/e-mail/Google reais (V3), túnel/domínio/R2 (F9/V4).

## Como repetir
```bash
./build.sh                      # backend (unit + integração) + front (lint, tsc, unit, build)
cd frontend && npm run test:e2e # E2E (precisa do docker-compose.dev.yml no ar)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build   # stack de produção
```
