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
