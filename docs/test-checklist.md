# MarcaAí — Checklist de Teste Ponta a Ponta (Q1–Q8)

> Guia de validação manual. Pré-requisitos: migração aplicada (`dotnet ef database update`),
> `normalize_plan_codes.sql` rodado, `./build.sh` verde, `Stripe:SecretKey` + `Stripe:Prices:*` +
> webhooks configurados, `stripe listen` ativo para os dois endpoints.

## 0. Setup
- [ ] Backend sobe sem erro (`dotnet run`) e `/api/v1` responde.
- [ ] Frontend sobe (`npm run dev`) e a landing carrega.
- [ ] Criar 3 preços recorrentes no Stripe (Solo Pro, Clínica, Clínica Pro) e colar os IDs em `Stripe:Prices:*`.

## 1. Planos e pricing (Q1)
- [ ] Landing `/#pricing` mostra **4 planos** em 1 linha no desktop (grid 1/2/4), sem quebra 3+1.
- [ ] Taxas exibidas: Solo 10% · Solo Pro 5% · Clínica 2,49% · Clínica Pro 1,99%.
- [ ] Preços: Solo R$0 · Solo Pro R$49 · Clínica R$129 · Clínica Pro R$199.

## 2. Gating da Clínica (Q2)
- [ ] Logado em plano **individual** (Solo/Solo Pro): item "Clínica" **não** aparece no menu (desktop e mobile).
- [ ] Acessar `/dashboard/team` por URL direta → **redireciona** para `/dashboard`.
- [ ] Em plano **Clínica** (assinatura ativa/trial): "Clínica" aparece e `/dashboard/team` abre.

## 3. Tela de planos neutra (Q3)
- [ ] `/dashboard/plans` abre **sem** abas de clínica (`ClinicTabs`).
- [ ] Usuário individual vê **apenas** Solo/Solo Pro; usuário de clínica vê apenas Clínica/Clínica Pro.
- [ ] CTAs de upgrade (PremiumGate/TrialBanner) levam a `/dashboard/plans`.

## 4. Recebimentos (Q4)
- [ ] `/dashboard/recebimentos` sem conta → card "Ativar recebimentos".
- [ ] Clicar em "Ativar" → redireciona ao **Stripe Connect** (Account Link/KYC).
- [ ] Concluir KYC → webhook `account.updated` → status vira **ACTIVE** no card.
- [ ] Sem `Stripe:SecretKey`: conta fica **PENDING** (log de aviso), sem crash.

## 5. Financeiro real (Q5)
- [ ] Sem consultas pagas → `/dashboard/financeiro` mostra **empty state** ("Nenhuma movimentação ainda"), sem números fake.
- [ ] Após uma consulta paga (webhook `payment_intent.succeeded`): métricas e gráfico refletem valores reais.
- [ ] `/dashboard/team/financeiro` (OWNER/ADMIN): consolidado real; **MEMBER** vê "Acesso restrito".
- [ ] Nenhum selo "Dados de demonstração" em nenhuma tela.

## 6. Enforcement + Taxas (Q6/Q7) — matriz plano × recurso
Para cada plano, verifique **liberado (✅) / bloqueado (403 🚫)**:

| Recurso / Plano                     | Solo (free) | Solo Pro | Clínica | Clínica Pro |
|-------------------------------------|:-----------:|:--------:|:-------:|:-----------:|
| Agendamentos ilimitados             | 🚫 (50/mês) | ✅       | ✅      | ✅          |
| Tipos de consulta ilimitados        | 🚫 (3)      | ✅       | ✅      | ✅          |
| WhatsApp reminders (disparo)        | 🚫          | ✅       | ✅      | ✅          |
| Custom branding (PUT team BrandColor)| 🚫 403     | 🚫 403   | ✅      | ✅          |
| Financeiro da clínica (`team_finance`)| 🚫        | 🚫       | ✅      | ✅          |
| Área/menu Clínica                   | 🚫          | 🚫       | ✅      | ✅          |
| Taxa de split aplicada              | 10%         | 5%       | 2,49%   | 1,99%       |

- [ ] **Split**: pagar uma consulta com cada plano e conferir `platformFeeCents` no `Booking` = feeBps × preço (sem taxa fixa).
- [ ] Solo (free) recebedor USER sem assinatura → 10%.
- [ ] Solo Pro (assinatura ativa) recebedor USER → 5%.
- [ ] WhatsApp reminder **não** dispara para Solo (só e-mail); dispara para Solo Pro+.
- [ ] PUT `/teams/{id}` mudando `BrandColor` num plano sem `custom_branding` → **403**.
- [ ] `GET /finance/teams/{id}/summary` como MEMBER → **403**.
- [ ] `POST /payouts/onboarding` com `teamId` de clínica alheia → **403**.

## 7. Trial (Q6)
- [ ] Plano **free (Solo)** com flag de trial legada → **não** ganha premium (hasPremiumAccess = false).
- [ ] Trial de **Solo Pro** → libera WhatsApp, **não** libera `team_finance`.
- [ ] Trial de **Clínica** → libera recursos de clínica.

## 8. Mocks removidos (Q6)
- [ ] Nenhuma tela mostra dados de clínica/billing fake; sem clínica → empty state "Crie sua clínica".
- [ ] Arquivos `lib/mocks/*` estão vazios (tombstone) e nada os importa.

## 9. User Billing / Solo Pro (Q7)
- [ ] `GET /user/billing` retorna `planCode/trial/usage/limits` reais.
- [ ] `POST /user/billing/checkout {planCode:"SOLO_PRO"}` → URL do Stripe; concluir → webhook cria `UserSubscription`.
- [ ] Após assinar Solo Pro: dashboard reflete plano **SOLO_PRO** e limites ilimitados.
- [ ] `POST /user/billing/checkout` com plano de clínica ou Solo (free) → **422**.

## 10. Retenção de intenção + checkout pós-onboarding (Q8)
- [ ] Na landing, clicar **Solo Pro** (deslogado) → vai para `/login?plan=SOLO_PRO`.
- [ ] Concluir login + onboarding → ao cair no `/dashboard`, **redireciona sozinho ao Stripe** (checkout Solo Pro), sem passar pela tela de planos.
- [ ] Após o checkout, a intenção é **limpa** (voltar ao dashboard não reabre o Stripe).
- [ ] Clicar **Clínica** (deslogado) → login/onboarding → cria clínica → checkout da clínica dispara ao ter `teamId`.
- [ ] Clicar **Solo** (grátis) → sem `?plan`, nenhum checkout dispara (fluxo free normal).
- [ ] Usuário **já onboarded** clicando um plano pago na landing → login → dashboard dispara o checkout direto.

## 11. Regressão de build
- [ ] `./build.sh` verde (backend + frontend) antes de subir.
- [ ] `dotnet ef migrations add` não gera migração inesperada (modelo == snapshot).
