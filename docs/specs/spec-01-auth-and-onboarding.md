# Spec 01: Auth & Onboarding

## 1. Contexto e Objetivo
A aplicação possui as configurações básicas do NextAuth (v5) e o modelo de dados `User` preparado no Prisma. Contudo, o fluxo ponta-a-ponta de autenticação e a jornada de novos usuários não estão fechados. 

O objetivo desta Spec é:
1. **Autenticação (Login):** Garantir que o usuário consiga fazer o login utilizando provedores como Google e Email/Magic Link (NextAuth + Resend).
2. **Onboarding Obrigatório:** Após o primeiro login, um usuário não tem um `username` definido e o campo `onboarded` é `false`. O fluxo deve redirecioná-lo obrigatoriamente para `/onboarding` para definir seu *username* único (slug de URL), TimeZone local e Tema de preferência.
3. **Proteção de Rotas (Middleware):** Bloquear totalmente o acesso às rotas do Dashboard (`/dashboard/*`, `/settings/*`) para usuários deslogados, bem como redirecionar usuários logados mas *sem onboarding concluído* de volta para a rota `/onboarding`.

## 2. Arquivos Afetados
- `auth.ts` / `auth.config.ts` (Configuração final do NextAuth v5)
- `middleware.ts` (Proteção de Rotas e Redirecionamentos)
- `app/login/page.tsx` (UI de Login)
- `app/onboarding/page.tsx` (UI de Onboarding)
- `app/onboarding/actions.ts` (Server Actions para validar e salvar o Onboarding)
- `lib/validators/onboarding.ts` (Schemas do Zod)

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Finalização da Configuração do Auth.js
Garantir em `auth.ts` que o `PrismaAdapter` está configurado corretamente. Além disso, usar os provedores `Google` e `Resend` (EmailProvider) e mapear os callbacks de Sessão para incluir os campos `username` e `onboarded` no objeto `session.user`.

### Passo 3.2: Implementação do Middleware
Criar o arquivo `middleware.ts` na raiz do projeto contendo a lógica de proteção. Ele deve verificar se a rota é protegida (sob `/dashboard` ou `/settings`). Se o usuário não tiver sessão, redirecionar para `/login`. Se tiver sessão mas `session.user.onboarded === false` (e não estiver já na rota `/onboarding`), redirecioná-lo para `/onboarding`.

### Passo 3.3: Tela de Login e Formulário de Onboarding
- Em `app/login/page.tsx`, construir um layout limpo para disparar o login do Google e Email (via `signIn` do `next-auth/react` ou Server Actions).
- Em `app/onboarding/page.tsx`, exibir um formulário capturando o Username (ex: `marcaai.com/username`), Timezone do cliente (`Intl.DateTimeFormat().resolvedOptions().timeZone` como default) e Tema.
- Ligar o formulário à Action em `app/onboarding/actions.ts`.

### Passo 3.4: Server Action de Onboarding
Em `app/onboarding/actions.ts`, validar a entrada com Zod (`lib/validators/onboarding.ts`). Verificar se o `username` não existe no banco, atualizar os dados do usuário (`username`, `timeZone`, `theme`, e `onboarded: true`) e realizar a atualização da sessão do Auth.js para redirecionar em segurança para `/dashboard`.

## 4. Critérios de Aceite
1. O usuário sem sessão deve ser redirecionado de `/dashboard` para `/login`.
2. Ao realizar o primeiro login, o banco marca `onboarded` como `false`. Tentar acessar o dashboard deve forçar a ida para `/onboarding`.
3. Escolher um `username` que já exista em outro perfil deve retornar um erro claro na interface ("Este nome de usuário já está em uso").
4. A conclusão do onboarding com dados válidos deve registrar as preferências no banco, setar `onboarded: true` e levar o usuário para o `/dashboard`.
