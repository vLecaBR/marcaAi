import { describe, it, expect } from "vitest"
import { toLocalTime, toUtcTime, formatInZone, buildUtcDateTime, rangesOverlap, subtractBusyFromWindow, generateSlotsInWindow, eachDayBetween, getDayOfWeekInZone } from "@/lib/scheduling/time-utils"

describe("Time Utils", () => {
  it("deve converter toLocalTime", () => {
    const utcDate = new Date("2024-01-01T12:00:00Z")
    const local = toLocalTime(utcDate, "America/Sao_Paulo")
    expect(local).toBeDefined()
  })

  it("deve formatar in zone", () => {
    const utcDate = new Date("2024-01-01T12:00:00Z")
    const str = formatInZone(utcDate, "America/Sao_Paulo")
    expect(str).toContain("09:00:00-03:00")
  })

  it("deve converter toUtcTime", () => {
    const localDate = new Date("2024-01-01T09:00:00Z") 
    const utc = toUtcTime(localDate, "America/Sao_Paulo")
    expect(utc).toBeDefined()
  })

  it("deve construir utc date time", () => {
    const day = new Date("2024-01-01T12:00:00Z")
    const date = buildUtcDateTime(day, "09:00", "America/Sao_Paulo")
    expect(date.toISOString()).toBe("2024-01-01T12:00:00.000Z")
  })

  it("rangesOverlap deve funcionar corretamente", () => {
    const a = { start: new Date("2024-01-01T10:00:00Z"), end: new Date("2024-01-01T11:00:00Z") }
    const b = { start: new Date("2024-01-01T10:30:00Z"), end: new Date("2024-01-01T11:30:00Z") }
    const c = { start: new Date("2024-01-01T11:00:00Z"), end: new Date("2024-01-01T12:00:00Z") }

    expect(rangesOverlap(a, b)).toBe(true)
    expect(rangesOverlap(a, c)).toBe(false)
  })

  it("subtractBusyFromWindow deve subtrair janelas bloqueadas e alinhar corretamente o cursor", () => {
    const window = { start: new Date("2024-01-01T10:00:00Z"), end: new Date("2024-01-01T12:00:00Z") }
    const busy = [
      { start: new Date("2024-01-01T10:30:00Z"), end: new Date("2024-01-01T11:00:00Z") },
      { start: new Date("2024-01-01T11:15:00Z"), end: new Date("2024-01-01T11:45:00Z") }
    ]

    const free = subtractBusyFromWindow(window, busy)
    expect(free).toHaveLength(2)
    
    // First free block before first busy
    expect(free[0].start.toISOString()).toBe("2024-01-01T10:00:00.000Z")
    expect(free[0].end.toISOString()).toBe("2024-01-01T10:30:00.000Z")

    // Cursor after first block (ends 11:00) aligns to 30m grid -> 11:00
    // Next busy block starts at 11:15. So free block is 11:00 - 11:15
    expect(free[1].start.toISOString()).toBe("2024-01-01T11:00:00.000Z")
    expect(free[1].end.toISOString()).toBe("2024-01-01T11:15:00.000Z")

    // Cursor after second block (ends 11:45) aligns to 30m grid -> 12:00
    // Window ends at 12:00. 12:00 < 12:00 is false, so no free block after.
  })

  it("generateSlotsInWindow deve gerar slots e quebrar o loop ao passar o fim", () => {
    const window = { start: new Date("2024-01-01T10:00:00Z"), end: new Date("2024-01-01T10:45:00Z") }
    const slots = generateSlotsInWindow(window, 30, 0, 0)
    
    // Slot 10:00-10:30 fits. Cursor becomes 10:30. Next slot 10:30-11:00 does not fit since end is 10:45. Loop breaks.
    expect(slots).toHaveLength(1)
  })

  it("eachDayBetween deve gerar lista de dias", () => {
    const from = new Date("2024-01-01T00:00:00Z")
    const to = new Date("2024-01-03T00:00:00Z")
    const days = eachDayBetween(from, to)
    
    expect(days).toHaveLength(3)
  })

  it("getDayOfWeekInZone deve retornar o dia correto", () => {
    const date = new Date("2024-01-01T12:00:00Z") // 2024-01-01 was a Monday (1)
    const dow = getDayOfWeekInZone(date, "America/Sao_Paulo")
    expect(dow).toBe(1)
  })
})