# Spec 03: Prevenção de Double-Booking & Atomicidade

## 1. Contexto e Objetivo
O sistema central do SaaS de agendamento depende de duas rotas cruciais: `/api/slots` (leitura) e `/api/book` (gravação). Na rota de agendamento (via `lib/actions/booking.ts`), há um risco arquitetural grave de *Double-Booking* (agendamento duplo) por conta de concorrência de requisições. 

O objetivo desta Spec é:
1. **Travar Concorrência:** Garantir que dois clientes não consigam agendar o mesmo horário se enviarem a requisição no exato mesmo milissegundo.
2. **Transações Atômicas:** A criação do agendamento, possíveis convites via e-mail/calendário e cobrança devem fazer parte de um fluxo transacional.
3. **Otimização de Query:** Garantir que o índice composto na tabela `Booking` exista e seja utilizado para bloquear sobreposições de horários.

## 2. Arquivos Afetados
- `prisma/schema.prisma` (Checagem de índices)
- `lib/actions/booking.ts` (Lógica de criação do Agendamento)
- `app/api/book/route.ts`

## 3. Instruções de Execução (Passo a Passo)

### Passo 3.1: Verificação de Índices
Em `prisma/schema.prisma`, certifique-se de que existe um índice focado em queries temporais. Já existe o `@@index([userId, startTime, endTime, status])`. Avalie se para prevenir overlap de forma restrita no banco, devemos usar lógica na Action. Como o Prisma não possui `EXCLUDE USING gist` nativo para range de datas, faremos no nível de transação.

### Passo 3.2: Transação e Isolamento (Prisma)
Vá para a função `createBooking` dentro de `lib/actions/booking.ts`.
1. Ao invés de checar horários e depois salvar (o que abre espaço para *race conditions*), todo o bloco de checagem e inserção precisa estar dentro de um `prisma.$transaction(async (tx) => { ... })`.
2. Para cenários super críticos de concorrência em PostgreSQL, considere fazer um lock explícito ou usar o nível de isolamento `Serializable` na transação do Prisma. Exemplo: `prisma.$transaction(..., { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`.

### Passo 3.3: Tratamento de Erros Customizados
Se a transação falhar por causa de concorrência ou porque o horário acabou de ser ocupado, a API deve retornar um erro HTTP 409 (Conflict), com uma mensagem clara para o usuário: "Este horário acabou de ser reservado por outra pessoa. Por favor, escolha outro horário."
O código em `app/api/book/route.ts` já mapeia `result.status === "conflict"`, mas é necessário garantir que a Action dispare esse status corretamente.

## 4. Critérios de Aceite
1. Dois testes simultâneos (via script em Node disparando `Promise.all([fetch, fetch])` para o mesmo slot) não podem resultar em dois registros `CONFIRMED` sobrepostos no banco de dados. Um deve passar (200), outro deve falhar (409 Conflict).
2. O código de erro e mensagens não podem expor logs do Prisma ao cliente.