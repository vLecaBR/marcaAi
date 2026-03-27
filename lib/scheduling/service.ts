import { prisma } from "@/lib/prisma"
import { addDays, startOfDay, endOfDay } from "date-fns"
import { buildAvailableWindows } from "./availability"
import { computeAvailableSlots, groupSlotsByDate, getAvailableDates } from "./slots"
import type { SlotInput, ScheduleData } from "./types"

interface GetSlotsParams {
  username: string
  eventSlug: string
  viewerTimeZone: string
  dateFrom?: Date
  dateTo?: Date
}

interface GetSlotsResult {
  success: boolean
  data?: {
    slots: ReturnType<typeof computeAvailableSlots>
    groupedByDate: Record<string, ReturnType<typeof computeAvailableSlots>>
    availableDates: string[]
    eventType: {
      id: string
      title: string
      duration: number
      description: string | null
    }
    owner: {
      name: string | null
      image: string | null
    }
  }
  error?: string
}

/**
 * Ponto de entrada principal para a UI de agendamento público.
 * Busca todos os dados necessários e retorna slots prontos para renderização.
 */
export async function getAvailableSlots(
  params: GetSlotsParams
): Promise<GetSlotsResult> {
  try {
    // 1. Busca o EventType com owner e schedule default
    const eventType = await prisma.eventType.findFirst({
      where: {
        slug: params.eventSlug,
        isActive: true,
        user: { username: params.username },
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
                      gte: startOfDay(params.dateFrom ?? new Date()),
                      lte: endOfDay(
                        params.dateTo ?? addDays(new Date(), eventType_bookingLimitDays(null))
                      ),
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
      return { success: false, error: "Tipo de evento não encontrado." }
    }

    const owner = eventType.user
    const schedule = owner.schedules[0]

    if (!schedule) {
      return { success: false, error: "Agenda não configurada." }
    }

    // 2. Define o intervalo de busca
    const lookAheadDays = eventType.bookingLimitDays ?? 60
    const dateFrom = params.dateFrom ?? startOfDay(new Date())
    const dateTo = params.dateTo ?? addDays(dateFrom, lookAheadDays)

    // 3. Busca agendamentos existentes no período
    const existingBookings = await prisma.booking.findMany({
      where: {
        userId: owner.id,
        status: { in: ["CONFIRMED", "PENDING"] },
        startTime: { gte: dateFrom },
        endTime: { lte: addDays(dateTo, 1) },
      },
      select: { startTime: true, endTime: true },
    })

    // 4. Monta o ScheduleData tipado
    const scheduleData: ScheduleData = {
      timeZone: schedule.timeZone,
      availabilities: schedule.availabilities.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      exceptions: schedule.exceptions.map((ex) => ({
        date: ex.date,
        type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
        startTime: ex.startTime,
        endTime: ex.endTime,
      })),
    }

    // 5. Calcula janelas disponíveis
    const availableWindows = buildAvailableWindows(scheduleData, dateFrom, dateTo)

    // 6. Monta o input para o gerador de slots
    const slotInput: SlotInput = {
      userId: owner.id,
      eventDuration: eventType.duration,
      beforeBuffer: eventType.beforeEventBuffer,
      afterBuffer: eventType.afterEventBuffer,
      dateFrom,
      dateTo,
      viewerTimeZone: params.viewerTimeZone,
      bookingLimitDays: eventType.bookingLimitDays ?? undefined,
    }

    // 7. Computa os slots disponíveis
    const slots = computeAvailableSlots(
      availableWindows,
      existingBookings,
      slotInput
    )

    const groupedByDate = groupSlotsByDate(slots, params.viewerTimeZone)
    const availableDates = getAvailableDates(slots, params.viewerTimeZone)

    return {
      success: true,
      data: {
        slots,
        groupedByDate,
        availableDates,
        eventType: {
          id: eventType.id,
          title: eventType.title,
          duration: eventType.duration,
          description: eventType.description,
        },
        owner: {
          name: owner.name,
          image: owner.image,
        },
      },
    }
  } catch (error) {
    console.error("[getAvailableSlots]", error)
    return { success: false, error: "Erro interno ao calcular disponibilidade." }
  }
}

// helper interno para evitar referência circular no include
function eventType_bookingLimitDays(val: number | null): number {
  return val ?? 60
}