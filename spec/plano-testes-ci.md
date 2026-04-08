# Plano de Ação: Qualidade, Testes e CI/CD Completo (MarcaAí)

Este documento detalha o planejamento estratégico para implementar uma cultura de testes robusta e um pipeline de CI/CD 100% funcional, confiável e automatizado. O estado atual possui configurações básicas, mas requer aprofundamento para garantir que novas funcionalidades não quebrem o sistema.

## Fase 1: Infraestrutura de Testes e Banco de Dados Real (CI)

**O Problema Atual:**
O arquivo de CI (`.github/workflows/ci.yml`) utiliza `DATABASE_URL: "postgresql://mock"`. Isso impede a execução de testes de integração reais (Server Actions) e E2E, pois qualquer requisição que atinja o Prisma falhará.

**Ações:**
1. **Banco de Dados no CI (GitHub Actions):** Adicionar um _Service Container_ do PostgreSQL no `ci.yml`.
2. **Migrations e Seed de Teste:** Antes de rodar os testes (`npm run test:e2e`), rodar `npx prisma migrate reset --force` e um script de `seed` específico para testes (criando usuários e agendamentos base).
3. **Ambiente Isolado:** Configurar no Vitest (`vitest.config.ts`) e Playwright (`playwright.config.ts`) o uso de variáveis exclusivas (`.env.test`) para não correr risco de tocar em bancos de produção.

## Fase 2: Testes Unitários e de Integração (Vitest)

**Foco:** Garantir que a regra de negócio central (agendamentos, pagamentos, disponibilidade) funcione isoladamente.

**Ações:**
1. **Mock de Serviços Externos:** Implementar mocks globais no Vitest para o `resend` (e-mails), `stripe`, `mercadopago` e `googleapis` (Google Calendar). Nunca devemos bater em APIs reais durante o CI.
2. **Cobertura de Server Actions (`lib/actions/*`):** 
   - Testar a função `createBooking` verificando se o erro de "Double Booking" (horário já ocupado) é lançado corretamente.
   - Testar `cancelBooking` garantindo que o status no banco muda e a função de envio de e-mail (mockada) é chamada.
3. **Ampliar Testes da Engine de Slots (`scheduling.test.ts`):** Adicionar cenários com múltiplos eventos em horários diferentes (Timezones), e eventos que atravessam a meia-noite.

## Fase 3: Testes End-to-End Críticos (Playwright)

**Foco:** Garantir que o fluxo principal do usuário (acessar, agendar e pagar) nunca quebre.

**Ações:**
1. **Autenticação no Playwright (Fixtures):** Criar utilitários de login (ex: injetar o token de sessão diretamente no cookie do navegador de teste) para não precisar passar pela tela de login do Google em cada teste.
2. **Cenário 1: O Fluxo do Cliente (Agendamento Público):**
   - Navegar para `/user/evento`.
   - Selecionar uma data disponível (simulada).
   - Preencher o formulário com dados mockados.
   - Submeter e verificar o redirecionamento para a página de sucesso (com mock da API do Mercado Pago retornando sucesso).
3. **Cenário 2: O Fluxo do Dono (Dashboard):**
   - Logar como Admin.
   - Acessar `/dashboard/bookings`.
   - Visualizar o agendamento recém-criado.
   - Clicar em "Cancelar" e verificar se a UI reflete o status "Cancelado".

## Fase 4: Otimização do CI/CD e Quality Gates

**Foco:** Automação, velocidade e bloqueio de código ruim.

**Ações:**
1. **Quality Gates (PR Blockers):** Configurar o GitHub (Branch Protection) para exigir a aprovação do workflow de CI antes do Merge na `main`.
2. **Coverage Mínimo:** Configurar o Vitest para falhar o CI caso a cobertura de código das pastas `lib/` e `actions/` fique abaixo de 70% (`vitest run --coverage`).
3. **Deploy Contínuo (CD - Vercel):** Se os testes passarem na branch `main`, acionar o deploy automático (utilizando `vercel build` e `vercel deploy --prod` diretamente no GitHub Actions, garantindo que o deploy SÓ ACONTEÇA se o E2E passar).
4. **Cache Avançado:** Adicionar steps de cache mais robustos no Actions para as pastas `.next/cache` e dependências para reduzir o tempo do workflow de minutos para segundos.

## Fase 5: Monitoramento e Testes Não-Funcionais

**Foco:** Performance e regressão visual.

**Ações:**
1. **Regressão Visual (Visual Regression Testing):** Utilizar `expect(page).toHaveScreenshot()` do Playwright nas páginas públicas (`[username]`) para garantir que o layout responsivo (mobile e desktop) não quebre com atualizações do Tailwind.
2. **Lighthouse CI:** Adicionar uma action do Lighthouse para rodar na página de agendamento pública, garantindo que a pontuação de Performance não caia abaixo de 90 (afinal, essa página precisa ser rápida para converter clientes).
3. **Mailhog / Maildev (Opcional Local):** Subir um container Docker local de captura de e-mails para que os desenvolvedores possam visualizar os e-mails transacionais (Resend) sem precisar enviar para caixas reais durante o desenvolvimento.
