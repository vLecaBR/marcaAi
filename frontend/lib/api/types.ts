/**
 * Tipos de DTO da API .NET consumidos pelo front.
 *
 * Estes espelham os contratos de `docs/backend-api.md`. Mantidos manualmente na Fase 0;
 * podem ser gerados a partir do OpenAPI da API numa fase posterior. Enums são serializados
 * como string pelo backend.
 */

/** Usuário autenticado — retorno de `GET /auth/me` e dos fluxos de login (spec §3.2). */
export interface MeDto {
  id: string
  email: string
  /** Nome de exibição (ex.: "Dr teste"). Distinto de `username` (handle da URL pública). */
  name: string | null
  username: string | null
  onboarded: boolean
  timeZone: string
}

/** Provedores de pagamento aceitos por `POST /bookings/{uid}/pay` (spec §3.3). */
export type PaymentProvider = "MERCADO_PAGO" | "STRIPE"

/** Estados de pagamento do snapshot do Booking (spec §6.4). */
export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED"

/** Status da sub-conta de recebimento (PayoutAccount) — spec §6.1. */
export type PayoutAccountStatus = "PENDING" | "ACTIVE" | "RESTRICTED"

/**
 * Envelope de sucesso genérico do cliente HTTP. A camada de UI/BFF trabalha sobre `data`;
 * falhas são lançadas como `ApiError` (ver problem-details.ts), não retornadas aqui.
 */
export interface ApiResult<T> {
  data: T
  status: number
  /** Cookies `Set-Cookie` recebidos da API (ex.: rotação de token no refresh). */
  setCookies: string[]
}

/* ── DTOs de domínio (espelham docs/backend-api.md) ─────────────────────────── */

export type EventTypeColor =
  | "SLATE" | "ROSE" | "ORANGE" | "AMBER" | "EMERALD" | "TEAL" | "CYAN"
export type LocationType =
  | "GOOGLE_MEET" | "ZOOM" | "TEAMS" | "PHONE" | "IN_PERSON" | "CUSTOM"
export type ExceptionType = "BLOCKED" | "VACATION" | "OVERRIDE"
export type TeamRoleName = "OWNER" | "ADMIN" | "MEMBER"
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED" | "NO_SHOW"
export type Theme = "DARK" | "LIGHT" | "SYSTEM"

/** `GET /event-types` → item de lista. */
export interface EventTypeSummaryDto {
  id: string
  title: string
  slug: string
  description: string | null
  duration: number
  color: EventTypeColor
  isActive: boolean
  requiresConfirm: boolean
  locationType: LocationType
  price: number | null
  currency: string
  bookingCount: number
}

/** `GET /schedules` → agenda com janelas e exceções. */
export interface ScheduleDto {
  id: string
  name: string
  timeZone: string
  isDefault: boolean
  availabilities: { dayOfWeek: number; startTime: string; endTime: string }[]
  exceptions: ExceptionItemDto[]
}

export interface ExceptionItemDto {
  id: string
  date: string
  type: ExceptionType
  startTime: string | null
  endTime: string | null
  reason: string | null
}

/** `GET /teams` → item de lista (com o papel do usuário). */
export interface TeamSummaryDto {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  theme: Theme
  brandColor: string | null
  role: TeamRoleName
  memberCount: number
}

/** `GET /teams/{id}` → detalhe + membros. */
export interface TeamDetailDto extends Omit<TeamSummaryDto, "memberCount"> {
  members: TeamMemberDto[]
}

export interface TeamMemberDto {
  userId: string
  name: string | null
  email: string
  role: TeamRoleName
}

/**
 * `GET /teams/{teamId}/billing` → estado de plano/assinatura/uso/trial.
 * A definição definitiva vive em `billing-types.ts` (Fase 8); re-exportada aqui para
 * compatibilidade com quem já importava `TeamBillingDto` de `@/lib/api/types`.
 */
export type { TeamBillingDto, SubscriptionStatus, PlanUsageDto, TrialStateDto } from "@/lib/api/billing-types"

/** `GET /bookings` → item de lista do profissional. */
export interface BookingListItemDto {
  uid: string
  status: BookingStatus
  paymentStatus?: PaymentStatus
  startTime: string
  endTime: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  eventType: {
    title: string
    color: EventTypeColor
    duration: number
    locationType: LocationType
  }
}

/** `GET /public/{username}` → perfil público (usado para pré-preencher o perfil). */
export interface PublicProfileDto {
  username: string
  name: string | null
  bio: string | null
  image: string | null
  brandColor: string | null
  theme: Theme
  timeZone: string
}

/** `GET /me/profile` → perfil editável do profissional autenticado. */
export interface ProfileDto {
  name: string | null
  username: string | null
  timeZone: string
  bio: string | null
  image: string | null
  theme: Theme
  brandColor: string | null
  specialty: string | null
  council: string | null
  registrationNumber: string | null
  clinicName: string | null
  onboarded: boolean
}

/** `GET /event-types/{id}` → tipo de consulta completo (edição). */
export interface EventTypeDetailDto {
  id: string
  title: string
  slug: string
  description: string | null
  duration: number
  color: EventTypeColor
  isActive: boolean
  requiresConfirm: boolean
  beforeEventBuffer: number
  afterEventBuffer: number
  bookingLimitDays: number | null
  locationType: LocationType
  locationValue: string | null
  price: number | null
  currency: string
  questions: {
    id: string
    label: string
    type: "TEXT" | "TEXTAREA" | "SELECT" | "CHECKBOX" | "PHONE"
    placeholder: string | null
    required: boolean
    order: number
  }[]
}
