"use server";

import { prisma } from "@/lib/prisma"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { startOfDay, endOfDay, addDays } from "date-fns"
import type { CreateBookingInput } from "@/lib/validators/booking"
import type { ScheduleData } from "@/lib/scheduling/types"
import {
  sendBookingConfirmedEmail,
  sendBookingPendingEmail,
  sendOwnerNotifyEmail,
  sendBookingCancelledEmail,
} from "@/lib/email/send"
import {
  sendWhatsAppConfirmation,
  sendWhatsAppPending,
  sendWhatsAppCancellation,
} from "@/lib/whatsapp/send"
import { APP_URL } from "@/lib/email/resend"
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
    pixData?: {
      qrCodeBase64?: string
      qrCode?: string
      ticketUrl?: string
    } | null
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
        const requestedCount = input.recurringCount ?? 1
        const createdBookings = []
        const recurringEventId = requestedCount > 1 ? Math.random().toString(36).substring(2, 11) : null

        for (let i = 0; i < requestedCount; i++) {
          const currentStart = addDays(startUtc, i * 7)
          const currentEnd = addDays(endUtc, i * 7)

          const conflictingRows = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM bookings
            WHERE
              user_id   = ${input.ownerId}
              AND status IN ('CONFIRMED', 'PENDING')
              AND start_time < ${currentEnd}::timestamptz
              AND end_time   > ${currentStart}::timestamptz
            FOR UPDATE SKIP LOCKED
          `

          if (conflictingRows.length > 0) {
            throw new ConflictError(`Horário já reservado na repetição da semana ${i + 1}.`)
          }

          const newBooking = await tx.booking.create({
            data: {
              userId: input.ownerId,
              eventTypeId: input.eventTypeId,
              guestName: input.guestName,
              guestEmail: input.guestEmail,
              guestPhone: input.guestPhone ?? null,
              guestNotes: input.guestNotes ?? null,
              startTime: currentStart,
              endTime: currentEnd,
              guestTimeZone: input.guestTimeZone,
              status: eventType.requiresConfirm ? "PENDING" : "CONFIRMED",
              recurringEventId,
              recurringIndex: requestedCount > 1 ? i + 1 : null,
              responses: input.responses && input.responses.length > 0 ? {
                createMany: {
                  data: input.responses.map(r => ({
                    questionId: r.questionId,
                    answer: r.answer,
                  }))
                }
              } : undefined
            },
            select: {
              id: true,
              uid: true,
              userId: true,
              meetingId: true,
              startTime: true,
              endTime: true,
              guestName: true,
              guestEmail: true,
              status: true,
              recurringEventId: true,
              recurringIndex: true,
              eventType: {
                select: {
                  title: true,
                  requiresConfirm: true,
                  locationType: true,
                  locationValue: true,
                  user: { select: { name: true } },
                },
              },
            },
          })

          createdBookings.push(newBooking)
        }

        return createdBookings
      },
      {
        timeout: 20000, // Tempo maior para processar múltiplas repetições
        isolationLevel: "Serializable",
      }
    )

    // Pegamos a primeira reserva para usar como referência para pagamentos e e-mails base
    const firstBooking = booking[0]

    // ── PAGAMENTO PIX (SE APLICÁVEL) ─────────────────────────

    let pixData = null
    if (eventType.price && eventType.price > 0) {
      const { createPixPayment } = await import("@/lib/payments/mercadopago")
      const paymentResult = await createPixPayment({
        transactionAmount: eventType.price / 100,
        description: `Agendamento: ${eventType.title}`,
        payerEmail: input.guestEmail,
        payerFirstName: input.guestName.split(" ")[0],
        externalReference: firstBooking.uid,
      })

      if (paymentResult) {
        await prisma.booking.updateMany({
          where: { recurringEventId: firstBooking.recurringEventId ?? firstBooking.id }, // Se não tiver repetição usa id, se tiver atualiza todos da repetição
          data: {
            paymentReference: paymentResult.id,
            paymentStatus: "UNPAID",
          }
        })
        pixData = paymentResult
      }
    }

    // ── EMAILS (NÃO BLOQUEANTE) ─────────────────────────

    const ownerData = await prisma.user.findUnique({
      where: { id: input.ownerId },
      select: { email: true, timeZone: true },
    })

    let finalMeetingUrl = eventType.locationValue ?? null
    let finalMeetingId = null

    if (firstBooking.status === "CONFIRMED") {
      const { createGoogleCalendarEvent } = await import("@/lib/google/calendar")
      const eventResponse = await createGoogleCalendarEvent({
        userId: input.ownerId,
        title: `${firstBooking.eventType.title} com ${firstBooking.guestName}`,
        description: `Agendamento via MarcaAí\n\nConvidado: ${firstBooking.guestName} (${firstBooking.guestEmail})\nNotas: ${input.guestNotes ?? "Nenhuma"}`,
        startTime: startUtc,
        endTime: endUtc,
        guestName: firstBooking.guestName,
        guestEmail: firstBooking.guestEmail,
        createMeetLink: eventType.locationType === "GOOGLE_MEET",
        recurringCount: input.recurringCount ?? undefined,
      })

      if (eventResponse) {
        finalMeetingId = eventResponse.eventId
        if (eventResponse.meetLink) {
          finalMeetingUrl = eventResponse.meetLink
        }

        // Atualiza todos os bookings da repetição com o mesmo link
        if (firstBooking.recurringEventId) {
           await prisma.booking.updateMany({
             where: { recurringEventId: firstBooking.recurringEventId },
             data: { meetingId: finalMeetingId, meetingUrl: finalMeetingUrl }
           })
        } else {
           await prisma.booking.update({
             where: { id: firstBooking.id },
             data: { meetingId: finalMeetingId, meetingUrl: finalMeetingUrl }
           })
        }
      }
    }

    if (ownerData) {
      const emailData: BookingEmailData = {
        uid: firstBooking.uid,
        guestName: firstBooking.guestName,
        guestEmail: firstBooking.guestEmail,
        ownerName: firstBooking.eventType.user.name ?? "Organizador",
        ownerEmail: ownerData.email,
        eventTitle: firstBooking.eventType.title,
        startTime: firstBooking.startTime,
        endTime: firstBooking.endTime,
        guestTimeZone: input.guestTimeZone,
        ownerTimeZone: ownerData.timeZone,
        locationType: eventType.locationType,
        meetingUrl: finalMeetingUrl,
        requiresConfirm: firstBooking.eventType.requiresConfirm,
        allBookings: booking.map((b: any) => ({
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      }

      const whatsappData = {
        phone: input.guestPhone ?? "",
        guestName: firstBooking.guestName,
        eventTitle: firstBooking.eventType.title,
        ownerName: firstBooking.eventType.user.name ?? "Organizador",
        startTime: firstBooking.startTime,
        appUrl: APP_URL,
        uid: firstBooking.uid,
      }

      try {
        await Promise.all([
          firstBooking.eventType.requiresConfirm
            ? sendBookingPendingEmail(emailData)
            : sendBookingConfirmedEmail(emailData),
          sendOwnerNotifyEmail(emailData),
        ])
      } catch (err) {
        console.error("[email dispatch]", err)
      }

      if (whatsappData.phone) {
        try {
          await (firstBooking.eventType.requiresConfirm
            ? sendWhatsAppPending(whatsappData)
            : sendWhatsAppConfirmation(whatsappData))
        } catch (err) {
          console.error("[whatsapp dispatch]", err)
        }
      }
    }

    // ── RETURN NORMAL ─────────────────────────

    return {
      status: "success",
      data: {
        uid: firstBooking.uid,
        startTime: firstBooking.startTime,
        endTime: firstBooking.endTime,
        guestName: firstBooking.guestName,
        guestEmail: firstBooking.guestEmail,
        eventTitle: firstBooking.eventType.title,
        ownerName: firstBooking.eventType.user.name ?? "Organizador",
        requiresConfirm: firstBooking.eventType.requiresConfirm,
        pixData,
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

export async function cancelBooking(
  uid: string,
  reason: string,
  canceledBy: "OWNER" | "GUEST"
): Promise<{ status: "success" | "not_found" | "forbidden" | "internal"; message?: string }> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { uid },
      include: {
        eventType: {
          select: {
            title: true,
            locationType: true,
            locationValue: true,
            user: { select: { name: true, email: true, timeZone: true } },
          },
        },
      },
    })

    if (!booking) {
      return { status: "not_found", message: "Agendamento não encontrado." }
    }

    if (booking.status === "CANCELLED") {
      return { status: "forbidden", message: "Agendamento já está cancelado." }
    }

    const updated = await prisma.booking.update({
      where: { uid },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        canceledAt: new Date(),
        canceledBy,
      },
    })

    const emailData: BookingEmailData = {
      uid: booking.uid,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      ownerName: booking.eventType.user.name ?? "Organizador",
      ownerEmail: booking.eventType.user.email,
      eventTitle: booking.eventType.title,
      startTime: booking.startTime,
      endTime: booking.endTime,
      guestTimeZone: booking.guestTimeZone,
      ownerTimeZone: booking.eventType.user.timeZone,
      locationType: booking.eventType.locationType,
      meetingUrl: booking.eventType.locationValue ?? null,
      requiresConfirm: false, // Not used in cancel template
    }

    const whatsappData = {
      phone: booking.guestPhone ?? "",
      guestName: booking.guestName,
      eventTitle: booking.eventType.title,
      ownerName: booking.eventType.user.name ?? "Organizador",
      startTime: booking.startTime,
      appUrl: APP_URL,
      uid: booking.uid,
    }

    try {
      await sendBookingCancelledEmail(emailData, reason, canceledBy === "GUEST")
    } catch (err) {
      console.error("[sendBookingCancelledEmail]", err)
    }

    if (whatsappData.phone) {
      try {
        await sendWhatsAppCancellation(whatsappData, reason)
      } catch (err) {
        console.error("[whatsapp dispatch]", err)
      }
    }

    return { status: "success" }
  } catch (err) {
    console.error("[cancelBooking]", err)
    return { status: "internal", message: "Erro ao cancelar." }
  }
}