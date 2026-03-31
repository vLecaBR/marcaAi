import { prisma } from "@/lib/prisma"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { startOfDay, endOfDay, addDays } from "date-fns"
import type { CreateBookingInput } from "@/lib/validators/booking"
import type { ScheduleData } from "@/lib/scheduling/types"
import {
  sendBookingConfirmedEmail,
  sendBookingPendingEmail,
  sendOwnerNotifyEmail,
} from "@/lib/email/send"
import type { BookingEmailData } from "@/lib/email/templates"

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export type BookingSuccess = {
  status: "success"
  data: {
    uid: string
    startTime: Date
    endTime: Date
    guestName: string
    guestEmail: string
    eventTitle: string
    ownerName: string 
    requiresConfirm: boolean
  }
}

export type BookingError =
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "not_found"; message: string }
  | { status: "validation"; message: string }
  | { status: "internal"; message: string }

export type BookingResult = BookingSuccess | BookingError

// ─── Função principal ─────────────────────────────────────────────────────────

export async function createBooking(
  input: CreateBookingInput
): Promise<BookingResult> {
  const startUtc = new Date(input.startTimeUtc)
  const endUtc = new Date(input.endTimeUtc)

  const eventType = await prisma.eventType.findFirst({
    where: {
      id: input.eventTypeId,
      userId: input.ownerId,
      isActive: true,
    },
    include: {
      user: {
        include: {
          schedules: {
            where: { isDefault: true },
            include: {
              availabilities: true,
              exceptions: {
                where: {
                  date: {
                    gte: startOfDay(startUtc),
                    lte: endOfDay(addDays(startUtc, 1)),
                  },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  })

  if (!eventType) {
    return { status: "not_found", message: "Tipo de evento não encontrado ou inativo." }
  }

  const schedule = eventType.user.schedules[0]
  if (!schedule) {
    return { status: "not_found", message: "Agenda do organizador não configurada." }
  }

  const requestedMinutes =
    (endUtc.getTime() - startUtc.getTime()) / 1000 / 60

  if (requestedMinutes !== eventType.duration) {
    return {
      status: "validation",
      message: `Duração inválida. Esperado: ${eventType.duration} min.`,
    }
  }

  const scheduleData: ScheduleData = {
    timeZone: schedule.timeZone,
    availabilities: schedule.availabilities,
    exceptions: schedule.exceptions.map((ex) => ({
      ...ex,
      type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
    })),
  }

  const dateFrom = startOfDay(startUtc)
  const dateTo = endOfDay(startUtc)

  const availableWindows = buildAvailableWindows(scheduleData, dateFrom, dateTo)

  const slotFitsInWindow = availableWindows.some((day) =>
    day.windows.some(
      (w) =>
        startUtc.getTime() >= w.start.getTime() &&
        endUtc.getTime() <= w.end.getTime()
    )
  )

  if (!slotFitsInWindow) {
    return {
      status: "unavailable",
      message: "Este horário está fora da disponibilidade do organizador.",
    }
  }

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        const conflictingRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM bookings
          WHERE
            user_id   = ${input.ownerId}
            AND status IN ('CONFIRMED', 'PENDING')
            AND start_time < ${endUtc}::timestamptz
            AND end_time   > ${startUtc}::timestamptz
          FOR UPDATE SKIP LOCKED
        `

        if (conflictingRows.length > 0) {
          throw new ConflictError("Horário já reservado.")
        }

        const newBooking = await tx.booking.create({
          data: {
            userId: input.ownerId,
            eventTypeId: input.eventTypeId,
            guestName: input.guestName,
            guestEmail: input.guestEmail,
            guestPhone: input.guestPhone ?? null,
            guestNotes: input.guestNotes ?? null,
            startTime: startUtc,
            endTime: endUtc,
            guestTimeZone: input.guestTimeZone,
            status: eventType.requiresConfirm ? "PENDING" : "CONFIRMED",
          },
          select: {
            uid: true,
            startTime: true,
            endTime: true,
            guestName: true,
            guestEmail: true,
            eventType: {
              select: {
                title: true,
                requiresConfirm: true,
                user: { select: { name: true } },
              },
            },
          },
        })

        return newBooking
      },
      {
        timeout: 10000,
        isolationLevel: "Serializable",
      }
    )

    // ── EMAILS (NÃO BLOQUEANTE) ─────────────────────────

    const ownerData = await prisma.user.findUnique({
      where: { id: input.ownerId },
      select: { email: true, timeZone: true },
    })

    if (ownerData) {
      const emailData: BookingEmailData = {
        uid: booking.uid,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        ownerName: booking.eventType.user.name ?? "Organizador",
        ownerEmail: ownerData.email,
        eventTitle: booking.eventType.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        guestTimeZone: input.guestTimeZone,
        ownerTimeZone: ownerData.timeZone,
        locationType: eventType.locationType,
        meetingUrl: eventType.locationValue ?? null,

        requiresConfirm: booking.eventType.requiresConfirm,
      }

      void Promise.all([
        booking.eventType.requiresConfirm
          ? sendBookingPendingEmail(emailData)
          : sendBookingConfirmedEmail(emailData),
        sendOwnerNotifyEmail(emailData),
      ]).catch((err) => console.error("[email dispatch]", err))
    }

    // ── RETURN NORMAL ─────────────────────────

    return {
      status: "success",
      data: {
        uid: booking.uid,
        startTime: booking.startTime,
        endTime: booking.endTime,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTitle: booking.eventType.title,
        ownerName: booking.eventType.user.name ?? "Organizador",
        requiresConfirm: booking.eventType.requiresConfirm,
      },
    }
  } catch (err) {
    if (err instanceof ConflictError) {
      return { status: "conflict", message: err.message }
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2034"
    ) {
      return {
        status: "conflict",
        message: "Horário reservado simultaneamente. Por favor, escolha outro.",
      }
    }

    console.error("[createBooking] Erro inesperado:", err)
    return { status: "internal", message: "Erro interno ao criar agendamento." }
  }
}

// ─── Erro ─────────────────────────────────────────────────────────────────────

class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
  }
}