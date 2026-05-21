# Spec 04: Isolamento de Dados Multi-Tenant (B2B SaaS Security)

## 1. Contexto e Objetivo
Para um SaaS B2B "SEGURO (nao pode vazar dado nenhum)", é essencial o conceito de Multi-Tenant Data Isolation. Um usuário autenticado (ou Membro de um Time) só pode ler/escrever dados que pertencem a ele ou ao time do qual ele faz parte. Falhas nesse isolamento (IDOR - Insecure Direct Object Reference) são as mais críticas em aplicações SaaS.

O objetivo desta Spec é:
1. **Prevenir IDOR em Endpoints:** Rotas da API e Server Actions não podem confiar cega e unicamente no ID passado pela requisição do cliente.
2. **Autorização de Deleção e Atualização:** Sempre cruzar o `userId` da sessão logada com o `userId` (ou `teamId`) dono do recurso sendo manipulado.
3. **Segurança no Dashboard:** Garantir que a busca de agendamentos, clientes, e event types, traga única e exclusivamente os dados atrelados à conta.

## 2. Arquivos Afetados
- Todas as `actions` dentro de `app/dashboard/**/actions.ts`
- Arquivos de rota dentro de `app/api/**/route.ts`
- Componentes de Client e Server que fazem *fetching* de dados.

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Auditoria em Server Actions
Em todas as ações que atualizam, deletam ou alteram configurações (ex: editar `EventType`, deletar `Booking`, alterar configurações de `Team`):
1. Inicie a função buscando a sessão com o auth: `const session = await auth()`. Se não houver, dispare throw ou retorne 401.
2. Se a action recebe um `id` para modificar algo, a query no Prisma **obrigatoriamente** precisa incluir `userId: session.user.id` no objeto `where`.
   Exemplo Correto: `prisma.eventType.update({ where: { id: inputId, userId: session.user.id }, data: {...} })`
   Exemplo Errado (IDOR): `prisma.eventType.update({ where: { id: inputId }, data: {...} })`

### Passo 3.2: Proteção de Dados de Cancelamento
Se a rota `app/api/book/[uid]/cancel/route.ts` é pública (por exemplo, um cliente final cancelando via link do e-mail):
1. Ela deve depender de um `uid` seguro (CUID longo e imprevisível) - já previsto no modelo Prisma.
2. Não exponha informações sensíveis do dono da agenda durante o cancelamento; responda apenas com o status de sucesso.

### Passo 3.3: Vazamento de PII (Personally Identifiable Information)
Revise `/api/slots/route.ts` e `/api/book/route.ts`. Não retorne o nome do cliente, e-mail do cliente, ou notas da reunião nas respostas não autenticadas de busca de horários. A interface só precisa saber que um horário está `busy` (ocupado), e não quem o ocupou.

## 4. Critérios de Aceite
1. Tentativas maliciosas de enviar um `POST` com um ID de um `EventType` de outro usuário (comprado via cURL/Postman) devem falhar com erro 403/404, sem modificar o banco.
2. A listagem de dados do Dashboard faz queries onde `userId` é explícito, provindo da `session` segura (no lado servidor), e não de *props* do cliente.
3. Nenhuma informação pessoal de clientes ("guests") vaza na API de slots/calendários.