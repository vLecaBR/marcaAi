import { notFound } from "next/navigation"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { BookingDetailDto } from "@/lib/api/booking-types"
import { formatInTimeZone } from "date-fns-tz"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ uid: string }>
  searchParams?: Promise<{ remarcada?: string }>
}

export const metadata: Metadata = { title: "Confirmação de agendamento", robots: { index: false, follow: false } }

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ReactNode
    bg: string
    label: string
    badge: string
  }
> = {
  CONFIRMED: {
    icon: (
      <svg
        className="h-7 w-7 text-care"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg:    "bg-care/10",
    label: "Confirmado",
    badge: "bg-care/10 text-care",
  },
  PENDING: {
    icon: (
      <svg
        className="h-7 w-7 text-warning"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg:    "bg-warning/10",
    label: "Aguardando confirmação",
    badge: "bg-warning/10 text-warning-foreground",
  },
  CANCELLED: {
    icon: (
      <svg
        className="h-7 w-7 text-destructive"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg:    "bg-destructive/10",
    label: "Cancelado",
    badge: "bg-destructive/10 text-destructive",
  },
  RESCHEDULED: {
    icon: (
      <svg
        className="h-7 w-7 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    ),
    bg:    "bg-muted",
    label: "Reagendado",
    badge: "bg-muted text-muted-foreground",
  },
  NO_SHOW: {
    icon: (
      <svg
        className="h-7 w-7 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
        />
      </svg>
    ),
    bg:    "bg-muted",
    label: "Não compareceu",
    badge: "bg-muted text-muted-foreground",
  },
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM:        "Zoom",
  TEAMS:       "Microsoft Teams",
  PHONE:       "Telefone",
  IN_PERSON:   "Presencial",
  CUSTOM:      "Online",
}

export default async function BookingConfirmationPage({ params, searchParams }: Props) {
  const { uid } = await params
  const justRescheduled = (await searchParams)?.remarcada === "1"

  // Detalhe da consulta — via API .NET (`GET /bookings/{uid}`, público). Sem Prisma.
  let dto: BookingDetailDto
  try {
    dto = await serverApiFetch<BookingDetailDto>(endpoints.bookings.byUid(uid))
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") notFound()
    throw err
  }

  // Adapta o DTO plano da API à forma aninhada que o restante da página consome.
  const booking = {
    uid: dto.uid,
    guestName: dto.guestName,
    guestEmail: dto.guestEmail,
    guestPhone: null as string | null,
    guestNotes: null as string | null,
    guestTimeZone: dto.guestTimeZone,
    startTime: dto.startTime,
    endTime: dto.endTime,
    status: dto.status,
    cancelReason: null as string | null,
    meetingUrl: dto.meetingUrl,
    locationDetail: dto.locationDetail ?? null,
    priceCents: dto.priceCents ?? null,
    payOnSite: dto.payOnSite ?? false,
    paymentStatus: dto.paymentStatus ?? "UNPAID",
    paymentDueAt: dto.paymentDueAt ?? null,
    eventType: {
      title: dto.eventTitle,
      duration: Math.max(0, Math.round((new Date(dto.endTime).getTime() - new Date(dto.startTime).getTime()) / 60000)),
      locationType: dto.locationType,
      user: { name: dto.ownerName, image: null as string | null, username: "" },
    },
  }

  // Consulta paga online aguardando o pagamento: a reserva segura o horário até `paymentDueAt`.
  const awaitingPayment =
    booking.status === "PENDING" && !!booking.priceCents && !booking.payOnSite &&
    booking.paymentStatus !== "PAID" && !!booking.paymentDueAt

  // Fallback seguro para status não mapeado
  const baseConfig = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG["CONFIRMED"]
  const config = awaitingPayment ? { ...baseConfig, label: "Aguardando pagamento" } : baseConfig

  const dateLabel = format(
    new Date(
      formatInTimeZone(
        booking.startTime,
        booking.guestTimeZone,
        "yyyy-MM-dd"
      ) + "T12:00:00"
    ),
    "EEEE, d 'de' MMMM 'de' yyyy",
    { locale: ptBR }
  )

  const startLabel = formatInTimeZone(
    booking.startTime,
    booking.guestTimeZone,
    "HH:mm"
  )

  const endLabel = formatInTimeZone(
    booking.endTime,
    booking.guestTimeZone,
    "HH:mm"
  )

  const isActive =
    booking.status === "CONFIRMED" || booking.status === "PENDING"

  return (
    <main className="min-h-screen bg-surface px-4 py-16">
      <div className="mx-auto max-w-md">

        {/* Status icon */}
        <div className="mb-8 text-center">
          <div
            className={cn(
              "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
              config.bg
            )}
          >
            {config.icon}
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {config.label}
          </h1>
          {justRescheduled && (
            <p className="mt-2 rounded-lg bg-care/10 px-3 py-2 text-sm text-care">Consulta remarcada com sucesso. Enviamos o novo horário por e-mail.</p>
          )}

          {awaitingPayment && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Seu horário está <b>reservado</b> até{" "}
                <b>{formatInTimeZone(booking.paymentDueAt!, booking.guestTimeZone, "HH:mm")}</b>. Conclua o pagamento
                para confirmar a consulta; sem ele a reserva é cancelada e o horário liberado.
              </p>
              <a
                href={`/booking/${booking.uid}/pay`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground"
              >
                Pagar e confirmar
              </a>
            </div>
          )}
          {booking.status === "PENDING" && !awaitingPayment && (
            <p className="mt-2 text-sm text-muted-foreground">
              {booking.eventType.user.name} receberá uma notificação e
              confirmará em breve.
            </p>
          )}
          {booking.status === "CONFIRMED" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Um e-mail de confirmação foi enviado para{" "}
              <span className="text-foreground font-medium">{booking.guestEmail}</span>.
            </p>
          )}
          {booking.status === "CANCELLED" && booking.cancelReason && (
            <p className="mt-2 text-sm text-muted-foreground">
              Motivo: {booking.cancelReason}
            </p>
          )}
        </div>

        {/* Detalhes */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm divide-y divide-border/60">

          {/* Owner + Evento */}
          <div className="flex items-center gap-4 p-5">
            {booking.eventType.user.image ? (
              <img
                src={booking.eventType.user.image}
                alt={booking.eventType.user.name ?? ""}
                className="h-10 w-10 shrink-0 rounded-full ring-1 ring-border object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-semibold text-brand-primary">
                {booking.eventType.user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">
                {booking.eventType.user.name}
              </p>
              <p className="font-medium text-foreground truncate">
                {booking.eventType.title}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                config.badge
              )}
            >
              {config.label}
            </span>
          </div>

          {/* Data e hora */}
          <div className="space-y-3 p-5">
            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              }
              label="Data"
              value={<span className="capitalize">{dateLabel}</span>}
            />
            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              label="Horário"
              value={`${startLabel} – ${endLabel} (${booking.eventType.duration} min)`}
            />
            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              }
              label="Local"
              value={LOCATION_LABELS[booking.eventType.locationType] ?? "Online"}
            />

            {/* Endereço / telefone (presencial e telefone não têm link) */}
            {(booking.eventType.locationType === "IN_PERSON" || booking.eventType.locationType === "PHONE") &&
              (booking.locationDetail ?? booking.meetingUrl) && (
              <DetailRow
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                }
                label={booking.eventType.locationType === "PHONE" ? "Telefone do atendimento" : "Endereço"}
                value={booking.locationDetail ?? booking.meetingUrl}
              />
            )}

            {/* Valor e situação do pagamento */}
            {booking.priceCents ? (
              <DetailRow
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                }
                label="Valor"
                value={`${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(booking.priceCents / 100)} · ${
                  booking.paymentStatus === "PAID" ? "pago"
                  : booking.paymentStatus === "REFUNDED" ? "reembolsado"
                  : booking.payOnSite ? "pago no atendimento"
                  : "aguardando pagamento"
                }`}
              />
            ) : null}

            {/* Link da reunião — só para consultas online */}
            {booking.meetingUrl && booking.eventType.locationType !== "IN_PERSON" && booking.eventType.locationType !== "PHONE" && (
              <DetailRow
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                }
                label="Link da consulta"
                value={
                  <a
                    href={booking.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary underline-offset-4 hover:underline"
                  >
                    Entrar na consulta
                  </a>
                }
              />
            )}

            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
                </svg>
              }
              label="Fuso horário"
              value={booking.guestTimeZone}
            />
          </div>

          {/* Dados do convidado */}
          <div className="space-y-3 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Seus dados
            </p>
            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              }
              label="Nome"
              value={booking.guestName}
            />
            <DetailRow
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              }
              label="E-mail"
              value={booking.guestEmail}
            />
            {booking.guestPhone && (
              <DetailRow
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                }
                label="Telefone"
                value={booking.guestPhone}
              />
            )}
            {booking.guestNotes && (
              <DetailRow
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                }
                label="Notas"
                value={booking.guestNotes}
              />
            )}
          </div>
        </div>

        {/* Nota de segurança/confiança (healthtech) */}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <svg className="h-3.5 w-3.5 text-care" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Seus dados são usados apenas para esta consulta. Veja a <a href="/privacidade" className="underline">Política de Privacidade</a>.
        </p>

        {/* Ações — adicionar à agenda, remarcar e cancelar */}
        {isActive && (
          <div className="mt-4 space-y-2">
            <a
              href={`/booking/${booking.uid}/ics`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-foreground transition-all hover:border-primary/40"
            >
              Adicionar à minha agenda (.ics)
            </a>
            <a
              href={`/booking/${booking.uid}/reschedule`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-foreground transition-all hover:border-primary/40"
            >
              Remarcar
            </a>
            <a
              href={`/booking/${booking.uid}/cancel`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Cancelar agendamento
            </a>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Agendamento via{" "}
          <span className="text-foreground font-medium">MarcaAí</span>
        </p>
      </div>
    </main>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground wrap-break-word">{value}</div>
      </div>
    </div>
  )
}
