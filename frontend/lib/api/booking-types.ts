/**
 * Tipos do fluxo de agendamento público (client-safe — sem `server-only`).
 * Substitui os tipos que vinham de `lib/scheduling/*` (removido no extermínio do Prisma).
 * A API .NET (`GET /slots`) devolve horários em UTC (ISO string).
 */

/** Slot de horário livre — datas em ISO (UTC). */
export interface Slot {
  startUtc: string
  endUtc: string
}

/** `GET /public/{username}` → perfil público + serviços ativos. */
export interface PublicEventTypeDto {
  id: string
  title: string
  slug: string
  description: string | null
  duration: number
  color: string
  locationType: string
  price: number | null
  currency?: string
  requiresConfirm: boolean
  beforeEventBuffer: number
  afterEventBuffer: number
  bookingLimitDays: number | null
}

export interface PublicProfileWithEventsDto {
  /** Id do profissional (ownerId). Necessário para `/slots` e `/bookings` públicos. */
  id: string
  username: string
  name: string | null
  bio: string | null
  image: string | null
  brandColor: string | null
  theme: string
  timeZone: string
  eventTypes: PublicEventTypeDto[]
}

/** Provedores aceitos por `POST /bookings/{uid}/pay` (spec §3.3). */
export type PaymentProviderName = "MERCADO_PAGO" | "STRIPE"

/** Estados de pagamento do snapshot do Booking (spec §6.4). */
export type PaymentStatusName =
  | "PENDING" | "UNPAID" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" | "FAILED"

/**
 * `POST /bookings/{uid}/pay` → intenção de pagamento (spec §3.3).
 * Cartão: `clientSecret` (confirmado via Stripe.js/Elements).
 * PIX: `pixQrCode` (copia-e-cola) + `pixQrCodeBase64` (imagem) + `pixTicketUrl`.
 */
export interface PaymentIntentDto {
  provider: PaymentProviderName
  clientSecret?: string | null
  pixQrCode?: string | null
  pixQrCodeBase64?: string | null
  pixTicketUrl?: string | null
  providerPaymentId: string
  amountCents: number
  applicationFeeCents: number
}

/** Resposta do polling de status (subset de `GET /bookings/{uid}`). */
export interface BookingStatusPollDto {
  uid: string
  status: string
  paymentStatus: PaymentStatusName
}

/** `GET /bookings/{uid}` → detalhe da consulta (confirmação). */
export interface BookingDetailDto {
  uid: string
  status: string
  paymentStatus?: string
  eventTitle: string
  ownerName: string | null
  startTime: string
  endTime: string
  guestName: string
  guestEmail: string
  guestTimeZone: string
  locationType: string
  meetingUrl: string | null
}
