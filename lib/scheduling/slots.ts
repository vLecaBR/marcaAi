import { addMinutes, isAfter, isBefore, startOfDay } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import type { SlotInput, Slot, BookingConflict, DayAvailability } from "./types"
import { subtractBusyFromWindow, generateSlotsInWindow } from "./time-utils"

/**
 * Dado um conjunto de janelas disponíveis do owner e os agendamentos
 * já existentes (conflicts), gera todos os slots disponíveis.
 * Esta função é pura — não acessa banco de dados.
 * A query de conflitos é responsabilidade da camada de serviço.
 */
export function computeAvailableSlots(
  availableWindows: DayAvailability[],
  existingBookings: BookingConflict[],
  input: SlotInput
): Slot[] {
  const now = new Date()
  const slots: Slot[] = []

  // Limite máximo de dias à frente
  const maxDate = input.bookingLimitDays
    ? addMinutes(startOfDay(now), input.bookingLimitDays * 24 * 60)
    : null

  for (const day of availableWindows) {
    // Não gera slots para datas além do limite
    if (maxDate && isAfter(day.date, maxDate)) continue

    for (const window of day.windows) {
      // Agendamentos que conflitam com esta janela (incluindo buffers)
      const windowBusy = existingBookings
        .filter((b) => {
          const bufferedStart = addMinutes(b.startTime, -input.beforeBuffer)
          const bufferedEnd = addMinutes(b.endTime, input.afterBuffer)
          return (
            isBefore(bufferedStart, window.end) &&
            isAfter(bufferedEnd, window.start)
          )
        })
        .map((b) => ({
          start: addMinutes(b.startTime, -input.beforeBuffer),
          end: addMinutes(b.endTime, input.afterBuffer),
        }))

      // Fragmentos livres desta janela após subtrair ocupados
      const freeFragments = subtractBusyFromWindow(window, windowBusy)

      for (const fragment of freeFragments) {
        const rawSlots = generateSlotsInWindow(
          fragment,
          input.eventDuration,
          input.beforeBuffer,
          input.afterBuffer
        )

        for (const slot of rawSlots) {
          // Slot no passado → pula
          if (!isAfter(slot.start, now)) continue

          slots.push({
            startUtc: slot.start,
            endUtc: slot.end,
            startLocal: formatInTimeZone(
              slot.start,
              input.viewerTimeZone,
              "yyyy-MM-dd'T'HH:mm:ssxxx"
            ),
            endLocal: formatInTimeZone(
              slot.end,
              input.viewerTimeZone,
              "yyyy-MM-dd'T'HH:mm:ssxxx"
            ),
            available: true,
          })
        }
      }
    }
  }

  return slots
}

/**
 * Agrupa slots por data local (no timezone do viewer).
 * Útil para renderizar o calendário na UI.
 * Retorna: { "2024-03-15": Slot[], "2024-03-16": Slot[], ... }
 */
export function groupSlotsByDate(
  slots: Slot[],
  viewerTimeZone: string
): Record<string, Slot[]> {
  const grouped: Record<string, Slot[]> = {}

  for (const slot of slots) {
    const dateKey = formatInTimeZone(slot.startUtc, viewerTimeZone, "yyyy-MM-dd")

    if (!grouped[dateKey]) {
      grouped[dateKey] = []
    }

    grouped[dateKey].push(slot)
  }

  return grouped
}

/**
 * Retorna apenas os dias que têm ao menos um slot disponível.
 * Usado para habilitar/desabilitar dias no calendário.
 */
export function getAvailableDates(
  slots: Slot[],
  viewerTimeZone: string
): string[] {
  return Object.keys(groupSlotsByDate(slots, viewerTimeZone)).sort()
}