# Spec 05: Setup para Produção, Performance e Deployment (Vercel)

## 1. Contexto e Objetivo
Para publicar o SaaS de forma gratuita (ou quase) na Vercel e mantê-lo seguro e estável em produção, precisamos ajustar a infraestrutura de conexão ao banco, limitar abusos (Rate Limiting) e checar os artefatos de build do Next.js. O projeto Next.js + Prisma pode enfrentar problemas de esgotamento de conexões ao banco (Connection Pooling) no ambiente Serverless da Vercel.

O objetivo desta Spec é:
1. **Configuração para a Vercel:** Preparar build limpo, checar variáveis, e otimizar banco de dados para evitar quedas.
2. **Rate Limiting e Segurança:** Impedir ataques de força bruta no formulário de login e agendamento.
3. **Hardening de Headers:** Utilizar o `next.config` para adicionar headers de segurança como Content-Security-Policy e Strict-Transport-Security.

## 2. Arquivos Afetados
- `next.config.mjs` ou `next.config.ts` (Criação/Modificação)
- `middleware.ts` (Implementação de Rate Limiting e Headers)
- `.env.example` (Definição clara das variáveis de produção)

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Configuração do Next.js (Headers de Segurança)
Crie ou altere `next.config.mjs` (ou .ts) para incluir:
```javascript
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
      ],
    },
  ];
}
```

### Passo 3.2: Otimização de Conexão com o Banco de Dados
Para deploy na Vercel com PostgreSQL (como Neon, Supabase ou RDS), certifique-se de que a `DATABASE_URL` no ambiente de produção aponta para um connection pooler compatível com transações ou adicione as extensões recomendadas (ex: PgBouncer, ou via string de conexão pgbouncer=true caso sua hospedagem permita). Atualize a documentação em `.env.example` para alertar o dev que subirá o projeto:
`DATABASE_URL="postgres://user:pass@host/db?pgbouncer=true"` (se usar Neon / Supabase).

### Passo 3.3: Proteção Básica de Middleware (Rate Limiting local ou Vercel KV)
Dado que a requisição é "da forma mais gratuita possível":
- A Vercel possui limites gratuitos rígidos. Para proteger a rota de e-mails (`/api/book`) e evitar custos altos no Resend, é vital fazer um simples controle. 
- Adicione uma checagem no `middleware.ts` para endpoints críticos (`/api/book`) bloqueando IPs que enviarem mais de 5 agendamentos por minuto. Se Vercel KV for caro, use uma implementação leve em memória para o servidor Node.js/Edge (embora Edge resete rápido, reduz spam básico).

### Passo 3.4: Criação do `.env.example`
Crie um arquivo `.env.example` espelhando todas as chaves requeridas em `lib/env.ts` (DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, STRIPE_*, RESEND_*, etc.) para facilitar o preenchimento seguro e correto no painel da Vercel.

## 4. Critérios de Aceite
1. O comando `npm run build` deve compilar com 0 erros de tipagem e 0 erros do ESLint.
2. Inspecionar a rede do navegador mostrará os cabeçalhos de segurança (X-Frame-Options, HSTS, etc.) em qualquer requisição.
3. O `.env.example` está completo e não contém segredos reais.