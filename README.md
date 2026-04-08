# MarcaAí / People OS

MarcaAí é uma plataforma SaaS moderna de agendamentos online projetada especialmente para o público brasileiro (Barbearias, Clínicas, Terapias, Consultorias, etc.). Com ela, profissionais e equipes podem criar páginas públicas elegantes para compartilhar com clientes, acabando com as longas trocas de mensagens no WhatsApp para encontrar um horário disponível.

## 🚀 Funcionalidades Principais

*   **Páginas Públicas Premium:** Vitrines estilo "Link in bio" (ex: `marcaai.com/barbearia-do-ze`) com design customizável (claro/escuro, cores da marca) e listagem de todos os serviços.
*   **Gestão de Equipes (B2B):** Suporte completo para times (Clínicas, Estúdios), com perfis de `OWNER`, `ADMIN` e `MEMBER`.
*   **Múltiplos Serviços & Customização:** Ofereça reuniões online (Google Meet, Zoom, Teams), presenciais ou por telefone. Defina duração, buffers de tempo (antes/depois) e limites de agendamento futuro.
*   **Onboarding Dinâmico:** Formulários customizados na etapa de agendamento (texto, textarea, telefone, etc.) para captar as informações certas de cada cliente.
*   **Gestão de Disponibilidade Avançada:**
    *   **Horários Recorrentes:** Múltiplos intervalos de horários por dia (ex: pausas para almoço).
    *   **Férias e Feriados:** Bloqueios pontuais (Exceptions) e sobreposições de horários de forma flexível.
*   **Integrações Poderosas:**
    *   **Google Calendar:** Prevenção de conflitos e geração automática de links de reuniões.
    *   **WhatsApp (Evolution API):** Lembretes e notificações automáticas de WhatsApp para reduzir o *no-show*.
    *   **E-mails Transacionais (Resend):** Comunicações elegantes (via React Email) e automáticas para convidados e profissionais.
*   **Monetização e Cobranças:**
    *   **Stripe:** Gestão de Assinaturas (SaaS B2B) para as equipes cadastradas.
    *   **Mercado Pago:** Cobranças antecipadas (Pix "Copia e Cola" e QR Code) liberando a vaga somente após a confirmação do pagamento (Webhooks).
*   **Anti Double-Booking:** Arquitetura robusta de banco de dados (`FOR UPDATE SKIP LOCKED`) para impedir sobreposições de horários de forma segura e concorrente.

## 🛠 Tecnologias Utilizadas

*   **Framework:** [Next.js 15+](https://nextjs.org/) (App Router, Server Actions) & React 19
*   **Linguagem:** TypeScript
*   **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/)
*   **Banco de Dados:** PostgreSQL (Hospedado no [Neon](https://neon.tech/))
*   **ORM:** [Prisma](https://www.prisma.io/)
*   **Autenticação:** [NextAuth.js v5 (Auth.js)](https://authjs.dev/)
*   **E-mails:** [Resend](https://resend.com/) + React Email
*   **Pagamentos & Assinaturas:** [Stripe](https://stripe.com/) (Assinaturas SaaS) e [Mercado Pago SDK](https://www.mercadopago.com.br/developers/) (Agendamentos)
*   **Validação:** Zod + React Hook Form
*   **Testes:** [Vitest](https://vitest.dev/) (Testes Unitários) e [Playwright](https://playwright.dev/) (Testes E2E)

## 💻 Como Rodar o Projeto (Desenvolvimento)

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` na raiz baseado no `.env.example` ou nas variáveis abaixo (requer chaves do Google OAuth, Neon PostgreSQL, Resend, Stripe e Mercado Pago). Exemplo:
   ```env
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
   
   AUTH_SECRET="seu_segredo_super_forte_aqui"
   AUTH_URL="http://localhost:3000"
   AUTH_GOOGLE_ID="google_client_id"
   AUTH_GOOGLE_SECRET="google_client_secret"
   
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="MarcaAí <noreply@seudominio.com>"
   
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   
   # Pagamentos
   MERCADOPAGO_ACCESS_TOKEN="APP_USR-..."
   STRIPE_SECRET_KEY="sk_test_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   
   # Integração WhatsApp
   WHATSAPP_API_URL="http://seu-servidor-evolution-api.com"
   WHATSAPP_API_KEY="sua_chave_de_api"
   ```
4. Sincronize o banco de dados:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. Inicie o servidor:
   ```bash
   npm run dev
   ```
6. Acesse `http://localhost:3000`.

## 🧪 Testes

O projeto adota uma rigorosa cobertura de testes unitários e de integração/E2E:

- **Testes Unitários:** Rode `npm run test` (ou `npm run test:watch` para modo interativo com Vitest).
- **Testes E2E (UI):** Rode `npm run test:e2e:ui` para abrir a interface gráfica do Playwright, ou `npm run test:e2e` para execução headless em background.
- **Cobertura de Testes:** Rode `npm run test:coverage` para gerar o relatório de cobertura detalhado.

## 📦 Cron Jobs e Lembretes (WhatsApp/E-mail)

Para o sistema de lembretes automáticos de WhatsApp e e-mail funcionar, existe uma rota configurada em `/api/cron/reminders`. Na Vercel, isso é configurado criando o arquivo `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 * * * *" 
    }
  ]
}
```
*(Esta rotina verifica a agenda a cada hora para disparar os lembretes do dia para os compromissos futuros)*

---
*Desenvolvido com foco em alta conversão, flexibilidade B2B e estabilidade.*