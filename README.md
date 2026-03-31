# MarcaAí

MarcaAí é uma plataforma SaaS moderna de agendamentos online projetada especialmente para o público brasileiro (Barbearias, Clínicas, Terapias, Consultorias, etc.). Com ela, profissionais podem criar páginas públicas elegantes para compartilhar com clientes e evitar o famoso "bate-volta" no WhatsApp tentando achar um horário em comum.

## 🚀 Funcionalidades Principais

*   **Páginas Públicas Premium:** Uma vitrine estilo "Link in bio" (ex: `marcaai.com/barbearia-do-ze`) com design escuro, moderno, contendo todos os serviços disponíveis.
*   **Múltiplos Serviços:** O profissional pode oferecer "Corte de Cabelo", "Barba", ou "Consulta de 1h", com durações e locais diferentes (Presencial, Google Meet, Zoom, Telefone).
*   **Gestão de Disponibilidade Avançada:**
    *   **Múltiplos Intervalos:** Suporte nativo para pausas para o almoço (ex: Seg a Sex das 09h às 12h e 13h às 18h).
    *   **Férias e Feriados:** Bloqueio de datas específicas no calendário (Schedule Exceptions).
*   **Fluxo de Aprovação:** Serviços podem ser de aprovação automática (corte de cabelo) ou exigirem confirmação manual pelo painel (mentorias/consultas).
*   **Notificações Multicanal:**
    *   📧 E-mails transacionais (Resend) para convidados e profissionais.
    *   💬 *Integração preparada para WhatsApp* com disparos e lembretes automáticos para reduzir o *no-show* (faltas).
*   **Anti Double-Booking:** Sistema transacional de banco de dados (`FOR UPDATE SKIP LOCKED`) para impedir sobreposições de horários de forma segura.

## 🛠 Tecnologias Utilizadas

*   **Framework:** [Next.js 15](https://nextjs.org/) (App Router, Server Actions)
*   **Linguagem:** TypeScript
*   **Estilos:** Tailwind CSS + [Lucide Icons](https://lucide.dev/)
*   **Banco de Dados:** PostgreSQL (Hospedado no [Neon](https://neon.tech/))
*   **ORM:** [Prisma](https://www.prisma.io/)
*   **Autenticação:** [NextAuth.js v5 (Auth.js)](https://authjs.dev/) - Suporte a Google OAuth e Magic Links.
*   **E-mails:** [Resend](https://resend.com/) + React Email
*   **Validação:** Zod + React Hook Form

## 💻 Como Rodar o Projeto (Desenvolvimento)

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` baseado no seu ambiente (você precisará configurar chaves do Google OAuth, Neon PostgreSQL e Resend). Exemplo de `.env`:
   ```env
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
   AUTH_SECRET="seu_segredo_super_forte_aqui"
   AUTH_URL="http://localhost:3000"
   AUTH_GOOGLE_ID="google_client_id"
   AUTH_GOOGLE_SECRET="google_client_secret"
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="People OS <noreply@seudominio.com>"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
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

## 📦 Cron Jobs e Lembretes

Para o sistema de lembretes automáticos de WhatsApp rodar, existe uma rota configurada em `/api/cron/reminders`. Na Vercel, isso é configurado criando o arquivo `vercel.json`:

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
*(No exemplo acima, ele varre a agenda a cada hora para disparar os lembretes do dia).*

---
*Desenvolvido com foco em alta conversão e estabilidade.*