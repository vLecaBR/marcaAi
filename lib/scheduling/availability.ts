import { isSameDay, isAfter, isBefore } from "date-fns"
import { toZonedTime } from "date-fns-tz"
import type { ScheduleData, DayAvailability, TimeRange } from "./types"
import {
  buildUtcDateTime,
  getDayOfWeekInZone,
  eachDayBetween,
  rangesOverlap,
} from "./time-utils"

/**
 * Para cada dia no intervalo [dateFrom, dateTo], calcula as janelas de
 * disponibilidade do owner em UTC, já descontando exceções (BLOCKED, VACATION).
 * Retorna apenas dias que têm ao menos uma janela disponível.
 */
export function buildAvailableWindows(
  schedule: ScheduleData,
  dateFrom: Date,
  dateTo: Date
): DayAvailability[] {
  const days = eachDayBetween(dateFrom, dateTo)
  const result: DayAvailability[] = []

  for (const day of days) {
    const dayOfWeek = getDayOfWeekInZone(day, schedule.timeZone)

    // Regras recorrentes para este dia da semana
    const rules = schedule.availabilities.filter(
      (a) => a.dayOfWeek === dayOfWeek
    )

    if (rules.length === 0) continue // sem disponibilidade neste dia da semana

    // Exceções para esta data específica
    const dayExceptions = schedule.exceptions.filter((ex) => {
      const exLocal = toZonedTime(ex.date, schedule.timeZone)
      const dayLocal = toZonedTime(day, schedule.timeZone)
      return isSameDay(exLocal, dayLocal)
    })

    // Dia inteiramente bloqueado?
    const fullDayBlock = dayExceptions.find(
      (ex) =>
        (ex.type === "BLOCKED" || ex.type === "VACATION") &&
        ex.startTime === null
    )
    if (fullDayBlock) continue

    // Constrói janelas base a partir das regras recorrentes
    let windows: TimeRange[] = rules.map((rule) => ({
      start: buildUtcDateTime(day, rule.startTime, schedule.timeZone),
      end: buildUtcDateTime(day, rule.endTime, schedule.timeZone),
    }))

    // Aplica exceções parciais (bloqueios com horário específico)
    const partialBlocks = dayExceptions.filter(
      (ex) =>
        (ex.type === "BLOCKED" || ex.type === "VACATION") &&
        ex.startTime !== null &&
        ex.endTime !== null
    )

    for (const block of partialBlocks) {
      const blockStart = buildUtcDateTime(day, block.startTime!, schedule.timeZone)
      const blockEnd = buildUtcDateTime(day, block.endTime!, schedule.timeZone)

      // Fragmenta as janelas existentes removendo o bloco
      windows = windows.flatMap((w) => {
        if (!rangesOverlap(w, { start: blockStart, end: blockEnd })) {
          return [w]
        }

        const fragments: TimeRange[] = []

        if (isBefore(w.start, blockStart)) {
          fragments.push({ start: w.start, end: blockStart })
        }
        if (isAfter(w.end, blockEnd)) {
          fragments.push({ start: blockEnd, end: w.end })
        }

        return fragments
      })
    }

    // Aplica OVERRIDE: se há exceção de override, substitui as janelas
    const overrides = dayExceptions.filter((ex) => ex.type === "OVERRIDE")
    if (overrides.length > 0) {
      windows = overrides
        .filter((ex) => ex.startTime !== null && ex.endTime !== null)
        .map((ex) => ({
          start: buildUtcDateTime(day, ex.startTime!, schedule.timeZone),
          end: buildUtcDateTime(day, ex.endTime!, schedule.timeZone),
        }))
    }

    if (windows.length === 0) continue

    result.push({
      date: day,
      dayOfWeek,
      windows,
    })
  }

  return result
}