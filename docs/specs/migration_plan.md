# Especificação Orientada a Etapas (Driven Spec) - Migração de Frontend Mobile-First para MarcaAE

## Visão Geral e Arquitetura Alvo
Este documento detalha o plano estratégico de migração do novo design visual contido em `newfrontend` para o repositório principal `marcaae`. 

A premissa fundamental desta migração é o princípio do **"Transplante Cirúrgico de Interface"**: a camada visual muda para um padrão estrito **Mobile-First**, mas a camada de dados (Prisma/PostgreSQL), a camada de segurança (NextAuth) e os mutadores de estado (Server Actions via `next-safe-action`) permanecem estritamente intactas.

### Ambiente Base (Fonte da Verdade)
- **Framework:** Next.js 15 (App Router) + React 19
- **Estilização:** Tailwind CSS v4
- **Dados & Auth:** PostgreSQL + Prisma ORM + NextAuth v5 (Beta)
- **Qualidade:** Playwright (E2E), Vitest (Unitários), Zod (Validação)

---

## Fases de Migração (Execução Sequencial e Atômica)

### Fase 1: Fundação Visual e Dependências (Infraestrutura)
**Objetivo:** Preparar o repositório principal para receber o novo sistema de design sem quebrar a UI atual, unificando dependências e variáveis CSS.
- **O que será movido:**
  - Adição/Atualização de dependências do `newfrontend/package.json` para o `marcaae/package.json` (focando em pacotes Radix UI, Framer Motion, Recharts, Embla Carousel).
  - Mesclagem das variáveis de design contidas em `styles/theme.css`, `styles/globals.css` e `default_shadcn_theme.css` para a configuração do Tailwind v4 do repositório alvo.
  - Importação e configuração de novas fontes customizadas (se presentes).
- **Requisitos de Segurança:**
  - Nenhuma alteração em Middleware ou NextAuth.
  - Validação de pacotes de UI de terceiros contra vulnerabilidades conhecidas (`npm audit` nas novas dependências de UI).
- **Critérios de Aceite (DoD) & Testes:**
  - O projeto base compila com sucesso (`npm run build`).
  - Nenhuma regressão na UI antiga (os testes do Playwright rodam e passam).
  - Variáveis do novo tema estão disponíveis na aplicação (verificação via devtools no browser).

### Fase 2: Construção da Biblioteca de Componentes ("Dumb Components")
**Objetivo:** Transpor a camada atômica de design (botões, inputs, modais) e garantir a integridade dos padrões Acessibilidade (a11y).
- **O que será movido:**
  - Diretório de componentes estruturais (`newfrontend/src/app/components/*` que sejam "dumb" e não dependam de contexto de página) para um novo diretório, por exemplo, `marcaae/components/ui-new/`.
  - Componentes Shadcn adaptados (Alerts, Dialogs, Select, Switches).
- **Requisitos de Segurança:**
  - Componentes de input (ex: `Input`, `Textarea`) NÃO devem conter lógica de sanitização de dados interna. Eles devem obrigatoriamente aceitar as `refs` do `react-hook-form` e delegar a sanitização ao Controller que usa o `zod` preexistente.
  - Validação de que não existem chamadas HTTP diretas ocultas em componentes de UI.
- **Critérios de Aceite (DoD) & Testes:**
  - Componentes novos isolados compilam no Next.js sem erro de "client-side" (uso correto da diretiva `"use client"` em componentes interativos).
  - Componentes renderizam visualmente de forma idêntica ao repositório Vite original.

### Fase 3: Layouts Base, Navegação Mobile-First e Shell da Aplicação
**Objetivo:** Substituir a estrutura envoltória (Layouts, Headers, Navbars, Sidebars) do App Router atual pela nova visão responsiva com prioridade Mobile.
- **O que será movido:**
  - Novos componentes de Menu de Navegação, Bottom Bar (Mobile) e Sidebar (Desktop).
  - Adaptação do `app/layout.tsx` e `app/(dashboard)/layout.tsx` para consumir o novo Shell.
- **Requisitos de Segurança:**
  - A renderização condicional do layout (ex: Menu do Dashboard vs Menu Público) DEVE continuar utilizando a sessão exposta no servidor através do `auth()` do NextAuth.
  - Rotas de navegação (Links) do Dashboard não podem ser exibidas para usuários deslogados. As checagens atuais do Middleware mantêm-se intransigentes.
- **Critérios de Aceite (DoD) & Testes:**
  - Acessando via dispositivo móvel (simulado), o usuário vê a nova Bottom Navigation. No Desktop, o layout se adapta (Sidebar ou Top Nav).
  - Passar nos testes: `tests/e2e/auth.spec.ts` (verificando se o layout de login renderiza e navega corretamente).

### Fase 4: Refatoração do Fluxo de Agendamento Público (Core Business)
**Objetivo:** Trocar a UI do sistema que o cliente final utiliza para agendar, reconectando a nova interface aos *Server Actions* existentes sem perder um único detalhe da lógica de calendário.
- **O que será movido:**
  - As Views do `newfrontend` referentes à visualização de calendário, seleção de horário e formulário de dados do cliente.
  - Acoplar o `react-hook-form` existente ao novo visual, garantindo que o `onSubmit` continue engatilhando as ações atuais (ex: `createBookingAction`).
- **Requisitos de Segurança:**
  - O Zod Schema utilizado para validar o payload do novo formulário DEVE ser o mesmo esquema existente. Nada de validação apenas front-end.
  - Políticas de Rate Limit, proteção contra Double Booking e validações de fuso horário, atreladas aos Server Actions, não são tocadas.
- **Critérios de Aceite (DoD) & Testes:**
  - A interface de agendamento está em formato Mobile-First, altamente fluída e responsiva.
  - Os testes de unidade do utils de disponibilidade (`tests/unit/availability.test.ts`) e agendamento (`tests/unit/scheduling.test.ts`) devem continuar passando intactos.
  - **Teste Crítico E2E:** `tests/e2e/public-flow.spec.ts` deve ser atualizado para buscar os novos seletores DOM (classes, IDs ou aria-labels do novo layout) e executar o agendamento fim a fim passando em verde.

### Fase 5: Refatoração do Dashboard do Usuário e Configurações (Painel Privado)
**Objetivo:** Atualizar a área restrita do administrador da conta (Listagem de Agendamentos, Configurações de Perfil, Horários e Integrações).
- **O que será movido:**
  - Views do dashboard do novo repositório.
  - Adaptação das páginas Server Components do `app/(dashboard)/*` para renderizarem as novas tabelas, cards de estatísticas (Recharts) e modais de configuração.
- **Requisitos de Segurança:**
  - Garantia de que cada Server Component adaptado retém suas validações de RLS (Row Level Security baseada em aplicação). Um usuário **não pode** listar agendamentos pertencentes ao `tenant_id`/`user_id` de outro.
  - As mutações (ex: Cancelar Agendamento, Mudar Tema, Mudar Horários) devem consumir os mesmos endpoints ou Actions autenticados já validados.
- **Critérios de Aceite (DoD) & Testes:**
  - O painel exibe perfeitamente gráficos, estatísticas e listagens no mobile e desktop usando os novos componentes Radix/Tailwind.
  - Atualização dos seletores nos testes E2E do painel.
  - **Teste Crítico E2E:** `tests/e2e/dashboard.spec.ts` roda com 100% de sucesso. Testes de unidade de integrações (ex: `tests/unit/google-calendar.test.ts`) rodam isolados sem falhas.

### Fase 6: Depreciação, Otimização de Perfomance e Hardening
**Objetivo:** Remover a camada visual legada, enxugar o pacote e garantir métricas Mobile de ponta.
- **O que será executado:**
  - Deleção sistemática dos arquivos antigos da pasta de componentes e estilos que não estão mais em uso.
  - Refatoração do Tailwind CSS legado e limpa de classes mortas se necessário.
  - Otimização de First Contentful Paint (FCP) e suporte a imagens (`next/image` nos novos componentes de avatar/logos).
- **Requisitos de Segurança:**
  - Fazer uma varredura rigorosa para garantir que no processo de migração das views do repositório `newfrontend` nenhuma chave de API mockada/hardcoded tenha sido trazida acidentalmente para o frontend (`NEXT_PUBLIC_*`).
- **Critérios de Aceite (DoD) & Testes:**
  - Build limpa sem avisos de componentes não utilizados.
  - Rodar o Lighthouse (foco em Mobile) pontuando >= 90 em Acessibilidade e Best Practices.
  - Todo o conjunto de testes (Unitários, Integração e E2E) passando 100% em pipeline local.

---

*Nota Arquitetural: Para garantir a sanidade de contexto durante a implementação via IA/Agente, recomenda-se iniciar e finalizar cada Fase em uma sessão independente, efetuando commits atômicos com testes aprovados ao final de cada fase.*