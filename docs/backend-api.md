# MarcaAí — Referência da API (.NET backend)

Base URL (dev): `http://localhost:5080`  ·  Prefixo: `/api/v1`

**Autenticação:** endpoints marcados 🔒 exigem o cookie de sessão (`marcaai_at`), emitido
pelo login (magic link ou Google). Envie os cookies na requisição (ex.: `curl -b cookies.txt`).
Erros seguem o formato **ProblemDetails** (RFC 7807). Enums são serializados como string.

---

## Auth

### POST `/auth/magic-link/request`
Solicita um link de acesso. Sempre responde 200 (não revela se o e-mail existe).
```json
// body
{ "email": "pro@clinica.com" }
// 200
{ "message": "Se o e-mail for válido, enviamos um link de acesso." }
```
Em dev, o link aparece no console da API (`MAGIC LINK (DEV)`).

### GET `/auth/magic-link/verify?token=...`
Valida o token (uso único), provisiona o usuário e emite os cookies de sessão.
Retorna `MeDto`. → `400` se inválido/expirado.

### GET `/auth/google/start`
Redireciona para o consentimento do Google (login + escopos de Calendar). Requer
`Google:ClientId/Secret` configurados.

### GET `/auth/google/complete`
Finaliza o OAuth: provisiona o usuário, grava tokens do Calendar em `accounts`, emite a sessão.
Retorna `MeDto`.

### POST `/auth/refresh`
Rotaciona o par de tokens a partir do refresh cookie. Retorna `MeDto`. → `401` se inválido.
Use após atualizar o perfil (para o token refletir `username`/`onboarded` novos).

### GET `/auth/me` 🔒
Retorna o usuário autenticado (das claims do token).
```json
{ "id": "c...", "email": "...", "username": null, "onboarded": false, "timeZone": "America/Sao_Paulo" }
```

### POST `/auth/logout`
Limpa os cookies de sessão. → `204`.

---

## Event Types 🔒 (escopado ao profissional)

### GET `/event-types`
Lista os tipos de consulta do usuário. Retorna `EventTypeSummaryDto[]`
(`id, title, slug, description, duration, color, isActive, requiresConfirm, locationType, price, currency, bookingCount`).

### POST `/event-types`
Cria. Body = `EventTypeInput`:
```json
{
  "title": "Consulta inicial", "slug": "consulta-inicial", "description": null,
  "duration": 50, "color": "VIOLET", "requiresConfirm": false,
  "beforeEventBuffer": 0, "afterEventBuffer": 0, "bookingLimitDays": 60,
  "locationType": "GOOGLE_MEET", "locationValue": null, "price": null, "currency": "BRL"
}
```
→ `201` com o resumo · `409` slug duplicado · `422` validação.

### PUT `/event-types/{id}`
Atualiza (mesmo body). → `200` · `404` · `409` · `422`.

### PATCH `/event-types/{id}/status`
Ativa/desativa. Body: `{ "isActive": true }`. → `204` · `404`.

### DELETE `/event-types/{id}`
Remove. → `204` · `404`.

---

## Schedules / Exceptions 🔒

### GET `/schedules`
Agendas do usuário com janelas e exceções. Retorna `ScheduleDto[]`:
```json
[{
  "id": "c...", "name": "Agenda Padrão", "timeZone": "America/Sao_Paulo", "isDefault": true,
  "availabilities": [{ "dayOfWeek": 1, "startTime": "09:00", "endTime": "18:00" }],
  "exceptions": [{ "id": "c...", "date": "2026-08-10", "type": "BLOCKED", "startTime": null, "endTime": null, "reason": "Feriado" }]
}]
```

### PUT `/schedules/{id}/availability`
Substitui **todas** as janelas. Body = `SaveAvailabilityInput`:
```json
{ "timeZone": "America/Sao_Paulo",
  "availabilities": [ { "dayOfWeek": 1, "startTime": "09:00", "endTime": "12:00" },
                      { "dayOfWeek": 1, "startTime": "14:00", "endTime": "18:00" } ] }
```
→ `204` · `404` · `422` (dia 0–6, formato HH:mm, start < end).

### POST `/schedules/{id}/exceptions`
Adiciona bloqueio/férias/override. Body = `AddExceptionInput`:
```json
{ "date": "2026-08-10", "type": "BLOCKED", "startTime": null, "endTime": null, "reason": "Feriado" }
```
`startTime` nulo = dia inteiro. → `200` (ExceptionItemDto) · `404` · `409` (já existe) · `422`.

### DELETE `/exceptions/{id}` 🔒
Remove a exceção. → `204` · `404`.

---

## Slots (público)

### GET `/slots?ownerId=&eventTypeId=&date=YYYY-MM-DD&tz=`
Horários disponíveis do profissional para o tipo de consulta na data (fuso do `tz`).
Considera janelas, exceções, buffers, agendamentos existentes e o **FreeBusy do Google**.
```json
{ "slots": [ { "startUtc": "2026-08-03T12:00:00Z", "endUtc": "2026-08-03T12:50:00Z" } ] }
```
→ `400` parâmetros inválidos · `404` evento/agenda não encontrados.

---

## Bookings

### POST `/bookings` (público)
Cria a consulta (anti double-booking + disponibilidade + evento Google/Meet). Body = `CreateBookingRequest`:
```json
{ "ownerId": "c...", "eventTypeId": "c...", "guestName": "Paciente",
  "guestEmail": "p@x.com", "guestPhone": null, "guestNotes": null,
  "startTimeUtc": "2026-08-03T12:00:00Z", "endTimeUtc": "2026-08-03T12:50:00Z",
  "guestTimeZone": "America/Sao_Paulo" }
```
→ `201` (`uid, startTime, endTime, status, requiresConfirm, eventTitle, meetingUrl`) ·
`404` evento inexistente · `422` duração inválida / fora da disponibilidade · `409` horário ocupado.

### GET `/bookings` 🔒 (dono)
Lista as consultas do profissional. Query opcional: `status`, `from`, `to`.
Retorna `BookingListItemDto[]`.

### GET `/bookings/{uid}` (público)
Detalhe da consulta (página de confirmação). Retorna `BookingDetailDto`. → `404`.

### POST `/bookings/{uid}/cancel` (público)
Cancela e remove o evento do Google. Body opcional:
```json
{ "reason": "Imprevisto", "canceledBy": "GUEST" }
```
→ `204` · `404` · `409` (já cancelado).

---

## Me 🔒 (perfil do profissional)

### PUT `/me/profile`
Atualiza perfil. Body = `UpdateProfileInput`:
```json
{ "name": "Dra. Ana", "username": "dra-ana", "timeZone": "America/Sao_Paulo",
  "bio": "Psicóloga", "theme": "LIGHT", "brandColor": "#0f766e" }
```
→ `204` · `409` username em uso · `422`. Depois chame `POST /auth/refresh`.

### POST `/me/onboarding/complete`
Marca o onboarding como concluído. → `204`.

---

## Public

### GET `/public/{username}` (público)
Perfil público + tipos de consulta ativos. Retorna `PublicProfileDto`
(`username, name, bio, image, brandColor, theme, timeZone, eventTypes[]`).
→ `404` se o username não existe.

---

## Teams / Clínicas 🔒

RBAC verificado por request (o usuário pode ter papéis diferentes em equipes diferentes).

### GET `/teams`
Equipes do usuário (com o papel dele). Retorna `TeamDto[]` (`id, name, slug, description, logo, theme, brandColor, role, memberCount`).

### GET `/teams/{id}`
Detalhe + membros (precisa ser membro). Retorna `TeamDetailDto` (inclui `members[]`: `userId, name, email, role`). → `404` se não for membro.

### POST `/teams`
Cria a clínica (o criador vira OWNER). Body = `TeamInput`:
```json
{ "name": "Clínica Vida", "slug": "clinica-vida", "description": null, "logo": null, "theme": "LIGHT", "brandColor": "#0f766e" }
```
→ `201` (TeamDto) · `409` slug em uso · `422`.

### PUT `/teams/{id}` (OWNER/ADMIN)
Atualiza. Mesmo body. → `204` · `403` · `404` · `409` · `422`.

### POST `/teams/{id}/members` (OWNER/ADMIN)
Convida um usuário **já existente** por e-mail. Body = `InviteMemberInput`:
```json
{ "email": "colega@clinica.com", "role": "MEMBER" }
```
`role`: ADMIN | MEMBER (padrão MEMBER). → `200` (TeamMemberDto) · `403` · `404` (usuário/equipe) · `409` (já é membro) · `422`.

### DELETE `/teams/{id}/members/{userId}`
Remove membro. Regras: OWNER remove qualquer um; ADMIN remove MEMBER (ou a si); MEMBER só a si. Não permite deixar a equipe sem OWNER.
→ `204` · `403` · `404` · `409` (último dono).

---

## Pagamentos

### Assinatura da clínica (Stripe) 🔒
- **POST** `/teams/{teamId}/billing/checkout` — inicia checkout (nova) ou portal (já cliente). Só OWNER. Retorna `{ "url": "..." }`. → `403` não-dono · `503` Stripe não configurado.
- **GET** `/teams/{teamId}/billing` — status: `{ teamId, status, active, currentPeriodEnd }` (status `none` se nunca assinou). Precisa ser membro.
- **POST** `/webhooks/stripe` (público, valida assinatura) — eventos `checkout.session.completed`, `customer.subscription.updated|deleted` atualizam a `subscriptions`.

### PIX de consultas (Mercado Pago)
- Quando o `EventType.price > 0`, o `POST /bookings` gera uma cobrança PIX e retorna o campo **`pix`** (`{ id, qrCodeBase64, qrCode, ticketUrl }`) junto da confirmação. Sem `MercadoPago:AccessToken`, `pix` vem `null`.
- **POST** `/webhooks/mercadopago` (público) — ao receber pagamento `approved`, marca a consulta (`external_reference` = uid) como `paymentStatus: PAID`.

Config (user-secrets): `Stripe:SecretKey`, `Stripe:WebhookSecret`, `Stripe:PriceId`; `MercadoPago:AccessToken`, `MercadoPago:NotificationUrl`.

---

## Infra
- `GET /health` — status do serviço.
- `GET /openapi/v1.json` (dev) — documento OpenAPI.
- `/hangfire` — dashboard de jobs.

---

## Enums (valores possíveis)
- **BookingStatus:** PENDING, CONFIRMED, CANCELLED, RESCHEDULED, NO_SHOW
- **PaymentStatus:** UNPAID, PAID, REFUNDED
- **EventTypeColor:** SLATE, ROSE, ORANGE, AMBER, EMERALD, TEAL, CYAN, VIOLET, FUCHSIA
- **LocationType:** GOOGLE_MEET, ZOOM, TEAMS, PHONE, IN_PERSON, CUSTOM
- **ExceptionType:** BLOCKED, VACATION, OVERRIDE
- **Theme:** DARK, LIGHT, SYSTEM
- **TeamRole:** OWNER, ADMIN, MEMBER
- **CanceledBy:** OWNER, GUEST, SYSTEM
