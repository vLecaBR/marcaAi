# MarcaAí — Backend API (.NET 10 · Clean Architecture)

Backend desacoplado da plataforma **MarcaAí** — SaaS de agendamento online para
**profissionais da saúde** (médicos, psicólogos, terapeutas, nutricionistas, dentistas
e clínicas). Substitui as Server Actions / API Routes do monolito Next.js original,
mantendo o mesmo banco PostgreSQL. O Next.js passa a ser apenas frontend consumindo esta API.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime / linguagem | .NET 10 · C# |
| Web | ASP.NET Core (controllers, minimal hosting) |
| ORM | Entity Framework Core 10 + Npgsql |
| Banco | PostgreSQL (Supabase em dev/prod) |
| Autenticação | JWT (HS256) em cookie **HttpOnly + Secure + SameSite=Strict** |
| Login | Magic Link (e-mail) + Google OAuth 2.0 (code flow) |
| Jobs | Hangfire (armazenamento em PostgreSQL) |
| Integrações | Google Calendar (FreeBusy, eventos, Meet) |
| IDs | CUID v1 via `cuid.net` (compatível com o Prisma `cuid()`) |
| Docs de API | OpenAPI (JSON em `/openapi/v1.json` no dev) |

Já implementado: auth (magic link + Google), agendamento com anti-double-booking,
disponibilidade + slots, Google Calendar (FreeBusy + Meet), CRUD de event types e agenda,
times/RBAC, notificações (e-mail Resend + WhatsApp Evolution), lembretes via Hangfire e
pagamentos (Stripe assinatura de clínicas + Mercado Pago PIX de consultas, com webhooks).

Pendentes (fases futuras): agendamento recorrente, formulário de anamnese (perguntas
customizadas), rate limiting, hardening de produção e integração do frontend Next.
Nota: testar os webhooks (Stripe/Mercado Pago) localmente exige uma URL pública (Stripe CLI
ou ngrok) — em produção, aponte os webhooks para o domínio da API.

---

## Arquitetura (Clean Architecture)

```
src/
  MarcaAi.Domain          → entidades + enums. Zero dependências.
  MarcaAi.Application      → portas (interfaces), DTOs, regras puras (scheduling).
  MarcaAi.Infrastructure   → EF Core, CUID, concorrência, Google, e-mail, jobs.
  MarcaAi.Api              → controllers, DI, auth, ProblemDetails, Hangfire.
```

Regra de dependência: `Api → Application + Infrastructure`, `Infrastructure → Application + Domain`,
`Application → Domain`. O **Domain** não depende de nada; a lógica de disponibilidade
(`Application/Scheduling`) é pura e testável sem banco.

### Decisões firmadas

| Tema | Decisão |
|---|---|
| Schema | Scaffold manual (database-first) → daqui em diante code-first (migrations do EF). Prisma descartado. |
| IDs | **CUID v1** gerado na aplicação (`CuidValueGenerator`), preservando IDs e URLs existentes. |
| Enums | **Nativos do Postgres**, mapeados via `MapEnum<T>()` no `UseNpgsql` (EF 9+/10), com name translator que preserva os labels (`DARK`, `GOOGLE_MEET`, `NO_SHOW`…). |
| Colunas | **camelCase** original do Prisma (`userId`, `startTime`…), via convenção automática + overrides snake_case do NextAuth (`refresh_token`). |
| Anti double-booking | `Read Committed` + `SELECT … FOR UPDATE SKIP LOCKED` (SQL parametrizado) dentro da mesma transação do INSERT. |
| Token | Cookie **HttpOnly + Secure + SameSite=Strict** carregando o JWT. CORS credenciado + Antiforgery. |
| Jobs | Hangfire sobre PostgreSQL (pool reduzido para o pooler do Supabase). |

---

## Estrutura de pastas

```
MarcaAi.Domain/
  Entities/            → User, Account, Session, VerificationToken, Team, TeamMember,
                         EventType, EventTypeQuestion, Schedule, ScheduleAvailability,
                         ScheduleException, Booking, BookingResponse, Subscription
  Enums/               → Theme, TeamRole, EventTypeColor, LocationType, QuestionType,
                         ExceptionType, BookingStatus, PaymentStatus, CanceledBy
MarcaAi.Application/
  Common/Interfaces/   → IApplicationDbContext, IJwtTokenService, IUserProvisioning,
                         IMagicLinkSender, IBookingService, IBookingConcurrencyGuard,
                         IAvailabilityService, IGoogleCalendarService
  Scheduling/          → TimeUtils, AvailabilityCalculator, SlotCalculator (regras puras)
  Features/            → DTOs por área (Auth, Bookings, EventTypes, Schedules, Public, Google, ...)
MarcaAi.Infrastructure/
  Persistence/         → ApplicationDbContext, Configurations, CuidValueGenerator,
                         BookingConcurrencyGuard, AuditableInterceptor, PreserveCaseNameTranslator
  Identity/            → JwtTokenService, UserProvisioning
  Google/              → GoogleCalendarService
  Scheduling/          → AvailabilityService
  Bookings/            → BookingService
  Email/               → LoggingMagicLinkSender (dev)
MarcaAi.Api/
  Controllers/         → Auth, GoogleAuth, EventTypes, Schedules, Exceptions,
                         Bookings, Slots, Me, Public
  Auth/                → AuthSessionWriter, ClaimsPrincipalExtensions
  Program.cs           → DI + pipeline
```

---

## Como rodar (dev)

Pré-requisitos: **.NET 10 SDK**, `dotnet-ef` (`dotnet tool install --global dotnet-ef`),
e o Postgres de dev: `docker compose -f docker-compose.dev.yml up -d` na raiz (porta **5433**).

**1. Segredos (fora do git, via user-secrets):**
```bash
cd src/MarcaAi.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=marcaai;Username=marcaai;Password=marcaai"
# Opcional (login Google + Calendar):
dotnet user-secrets set "Google:ClientId" "....apps.googleusercontent.com"
dotnet user-secrets set "Google:ClientSecret" "..."
```
> O `appsettings.Development.json` versionado aponta para o Postgres local do docker (a porta/credenciais
> serão alinhadas ao compose na F1); o user-secrets sobrepõe. **Nunca** comite senhas.

**2. Banco (primeira vez / banco vazio):**
```bash
cd ..            # backend/
dotnet ef database update --project src/MarcaAi.Infrastructure --startup-project src/MarcaAi.Api
```

**3. Rodar:**
```bash
dotnet run --project src/MarcaAi.Api
# API em http://localhost:5080
# OpenAPI (dev): http://localhost:5080/openapi/v1.json
# Hangfire dashboard: http://localhost:5080/hangfire
```

> Dica: **pare a API (Ctrl+C) antes de `dotnet build` ou de mexer em migrations** — senão
> o Windows trava os DLLs em uso.

Config do Google (para login + Calendar): habilite a **Google Calendar API** no Cloud Console
e cadastre o redirect URI `http://localhost:5080/api/v1/auth/google/callback`.

---

## Autenticação — como funciona

Dois fluxos de login, ambos terminam emitindo o **mesmo par de cookies** (`AuthSessionWriter`):

- **Magic Link:** `POST /auth/magic-link/request` grava um token de uso único em
  `verification_tokens` e envia o link (em dev, loga no console). `GET /auth/magic-link/verify`
  valida, provisiona o usuário (criando a "Agenda Padrão" seg–sex 09–18) e emite a sessão.
- **Google OAuth:** `GET /auth/google/start` → consentimento → `GET /auth/google/complete`
  provisiona o usuário, guarda os tokens do Calendar em `accounts` e emite a sessão.

**Tokens:** access JWT (15 min) + refresh JWT (30 dias), ambos em cookie HttpOnly. As claims
(`sub`, `email`, `username`, `onboarded`, `timeZone`) alimentam as policies de autorização.
`POST /auth/refresh` rotaciona os tokens (lendo o usuário fresco do banco — use após atualizar o perfil).

---

## Domínio — como funciona

**Disponibilidade (`Application/Scheduling`, puro):** a partir das regras recorrentes por dia
da semana + exceções (BLOCKED/VACATION/OVERRIDE) + buffers, calcula janelas em UTC e gera slots,
respeitando fusos (IANA via `TimeZoneInfo`). O `GET /slots` ainda une os horários ocupados do
**Google Calendar (FreeBusy)** aos agendamentos internos.

**Agendamento (`BookingService`):** valida evento + duração + disponibilidade; abre transação
`Read Committed`, roda `FOR UPDATE SKIP LOCKED` (anti double-booking), insere e commita; depois,
best-effort, cria o **evento no Google Calendar + link do Meet** (se o profissional tem Google
conectado). Falha no Google **não** desfaz a consulta.

**Cancelamento:** marca `CANCELLED`, registra motivo/autor e remove o evento do Google (best-effort).

**Notificações:** ao criar/cancelar uma consulta (e via job de lembrete a cada 15 min no Hangfire),
dispara e-mail (Resend) ao paciente e ao profissional + WhatsApp (Evolution API). Sensível ao local:
online → link de acesso; presencial → endereço; telefone → aviso. Todos os canais são best-effort e
condicionais (sem chave configurada, caem em modo log/simulado).

**Times/RBAC:** clínicas com múltiplos profissionais; papéis OWNER/ADMIN/MEMBER verificados por request
contra a associação do usuário na equipe.

---

## Referência de endpoints

Ver [`../docs/backend-api.md`](../docs/backend-api.md) para a lista completa com métodos,
autenticação, parâmetros e respostas.

Resumo por área:
- **Auth** — magic link, refresh, me, logout, Google OAuth.
- **Event Types** (protegido) — CRUD dos tipos de consulta.
- **Schedules / Exceptions** (protegido) — disponibilidade e bloqueios.
- **Bookings** — criar (público), listar (dono), detalhe por uid (público), cancelar (público).
- **Slots** (público) — horários disponíveis.
- **Me** (protegido) — perfil e onboarding.
- **Teams** (protegido) — clínicas: CRUD + convite/remoção de membros com RBAC.
- **Public** — página pública do profissional (`/public/{username}`).
