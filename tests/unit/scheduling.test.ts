import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { computeAvailableSlots } from "@/lib/scheduling/slots"
import { addMinutes, addHours, startOfDay, parseISO } from "date-fns"

describe("Scheduling Engine - computeAvailableSlots", () => {
  beforeEach(() => {
    // Congela o tempo para garantir que os slots "no passado" sejam previsíveis
    vi.useFakeTimers()
    vi.setSystemTime(parseISO("2024-03-10T08:00:00Z")) // <- Mudamos para mais cedo
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("deve gerar slots corretamente para uma janela de disponibilidade livre", () => {
    const start = parseISO("2024-03-10T11:00:00Z")
    const end = parseISO("2024-03-10T13:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    const slots = computeAvailableSlots(availableWindows, [], {
      userId: "user-1",
      eventDuration: 30, // 30 minutos
      beforeBuffer: 0,
      afterBuffer: 0,
      dateFrom: startOfDay(start),
      dateTo: end,
      viewerTimeZone: "UTC",
    })

    // Janela de 2 horas (120 minutos) / 30 minutos = 4 slots
    expect(slots.length).toBe(4)
    expect(slots[0].startUtc).toEqual(parseISO("2024-03-10T11:00:00Z"))
    expect(slots[0].endUtc).toEqual(parseISO("2024-03-10T11:30:00Z"))
    expect(slots[3].startUtc).toEqual(parseISO("2024-03-10T12:30:00Z"))
    expect(slots[3].endUtc).toEqual(parseISO("2024-03-10T13:00:00Z"))
  })

  it("deve subtrair conflitos (agendamentos existentes) corretamente", () => {
    const start = parseISO("2024-03-10T11:00:00Z")
    const end = parseISO("2024-03-10T13:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    // Um evento marcado bem no meio da janela, das 11:30 às 12:00
    const existingBookings = [
      {
        startTime: parseISO("2024-03-10T11:30:00Z"),
        endTime: parseISO("2024-03-10T12:00:00Z"),
      },
    ]

    const slots = computeAvailableSlots(availableWindows, existingBookings, {
      userId: "user-1",
      eventDuration: 30,
      beforeBuffer: 0,
      afterBuffer: 0,
      dateFrom: startOfDay(start),
      dateTo: end,
      viewerTimeZone: "UTC",
    })

    // Deve gerar apenas 3 slots agora (11:00, 12:00, 12:30)
    expect(slots.length).toBe(3)
    expect(slots[0].startUtc).toEqual(parseISO("2024-03-10T11:00:00Z"))
    expect(slots[1].startUtc).toEqual(parseISO("2024-03-10T12:00:00Z"))
    expect(slots[2].startUtc).toEqual(parseISO("2024-03-10T12:30:00Z"))
  })

  it("deve respeitar os buffers antes e depois de cada evento", () => {
    // Janela de 4 horas: 10:00 às 14:00
    const start = parseISO("2024-03-10T10:00:00Z")
    const end = parseISO("2024-03-10T14:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    // Evento marcado das 11:30 às 12:00
    const existingBookings = [
      {
        startTime: parseISO("2024-03-10T11:30:00Z"),
        endTime: parseISO("2024-03-10T12:00:00Z"),
      },
    ]

    // Buffer de 30 minutos DEPOIS do evento
    // O evento existente bloqueará das 11:30 até 12:30
    // Os novos slots (30 min) precisarão de 60 min livres (30 min slot + 30 min buffer)
    const slots = computeAvailableSlots(availableWindows, existingBookings, {
      userId: "user-1",
      eventDuration: 30,
      beforeBuffer: 0,
      afterBuffer: 30,
      dateFrom: startOfDay(start),
      dateTo: end,
      viewerTimeZone: "UTC",
    })

    // Fragmento 1: 10:00 às 11:30. Caberá apenas 1 slot: 10:00-10:30 (ocupando até 11:00 com o buffer)
    // O próximo começaria 11:00 e ocuparia até 12:00, mas o fragmento termina 11:30, então é descartado.
    // Fragmento 2: 12:30 às 14:00. Caberá apenas 1 slot: 12:30-13:00 (ocupando até 13:30)
    // O próximo começaria 13:30 e iria até 14:30, estourando a janela de 14:00.
    expect(slots.length).toBe(2)
    expect(slots[0].startUtc).toEqual(parseISO("2024-03-10T10:00:00Z"))
    expect(slots[1].startUtc).toEqual(parseISO("2024-03-10T12:30:00Z"))
  })

  it("não deve gerar slots no passado (antes de 'now')", () => {
    vi.setSystemTime(parseISO("2024-03-10T10:00:00Z")) // Volta o tempo só pra esse teste

    // Janela começa ANTES de 'now' que está mockado para 10:00
    const start = parseISO("2024-03-10T09:00:00Z")
    const end = parseISO("2024-03-10T11:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    const slots = computeAvailableSlots(availableWindows, [], {
      userId: "user-1",
      eventDuration: 30,
      beforeBuffer: 0,
      afterBuffer: 0,
      dateFrom: startOfDay(start),
      dateTo: end,
      viewerTimeZone: "UTC",
    })

    // Dos 4 slots (09:00, 09:30, 10:00, 10:30), os dois primeiros estão no passado
    // O slot de 10:00 começa exatamente no "now", então deve ser pulado também (isAfter é estrito)
    // Sobrando apenas o de 10:30
    expect(slots.length).toBe(1)
    expect(slots[0].startUtc).toEqual(parseISO("2024-03-10T10:30:00Z"))
  })

  it("deve lidar corretamente com conflitos de múltiplos eventos em fusos diferentes", () => {
    // Janela: 13:00 às 17:00 UTC
    const start = parseISO("2024-03-10T13:00:00Z")
    const end = parseISO("2024-03-10T17:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    // Eventos que ocorrerão baseados no fuso do organizador/cliente
    // Mas chegam na engine em UTC.
    const existingBookings = [
      {
        // Evento 1: 14:00 - 14:30 UTC
        startTime: parseISO("2024-03-10T14:00:00Z"),
        endTime: parseISO("2024-03-10T14:30:00Z"),
      },
      {
        // Evento 2: 15:30 - 16:15 UTC
        startTime: parseISO("2024-03-10T15:30:00Z"),
        endTime: parseISO("2024-03-10T16:15:00Z"),
      },
    ]

    const slots = computeAvailableSlots(availableWindows, existingBookings, {
      userId: "user-1",
      eventDuration: 30,
      beforeBuffer: 0,
      afterBuffer: 0,
      dateFrom: startOfDay(start),
      dateTo: end,
      viewerTimeZone: "America/Sao_Paulo", // A engine ignora ou lida, o output é UTC.
    })

    // Sem conflitos: 8 slots (13, 13.5, 14, 14.5, 15, 15.5, 16, 16.5)
    // Com conflito Evento 1: bloqueia 14:00 (remove 14:00)
    // Com conflito Evento 2: bloqueia 15:30 - 16:15 (remove 15:30, 16:00)
    // Restam: 13:00, 13:30, 14:30, 15:00, 16:30
    expect(slots.map((s) => s.startUtc.toISOString())).toEqual([
      "2024-03-10T13:00:00.000Z",
      "2024-03-10T13:30:00.000Z",
      "2024-03-10T14:30:00.000Z",
      "2024-03-10T15:00:00.000Z",
      "2024-03-10T16:30:00.000Z",
    ])
  })

  it("deve lidar corretamente com janelas de disponibilidade e eventos que atravessam a meia-noite", () => {
    // Janela que atravessa a meia noite no UTC: das 22:00 até 02:00 do dia seguinte
    const start = parseISO("2024-03-10T22:00:00Z")
    const end = parseISO("2024-03-11T02:00:00Z")

    const availableWindows = [
      {
        date: startOfDay(start),
        dayOfWeek: 0,
        windows: [{ start, end }],
      },
    ]

    // Evento conflitando a virada exata do dia
    const existingBookings = [
      {
        startTime: parseISO("2024-03-10T23:30:00Z"),
        endTime: parseISO("2024-03-11T00:30:00Z"), // Atravessa a meia noite
      },
    ]

    const slots = computeAvailableSlots(availableWindows, existingBookings, {
      userId: "user-1",
      eventDuration: 60, // Slots de 1h para simplificar
      beforeBuffer: 0,
      afterBuffer: 0,
      dateFrom: startOfDay(start),
      dateTo: parseISO("2024-03-11T23:59:59Z"),
      viewerTimeZone: "UTC",
    })

    // Janela: 22h, 23h, 00h, 01h (4 slots)
    // Conflito: 23:30 a 00:30.
    // O slot de 60min gerado inicia às 00:30 (termina 01:30), 
    // porque o engine agora tenta encaixar as folgas no horário alinhado mais próximo após o bloqueio de 23:30 a 00:30.
    // 00:30 já é múltiplo de 30 (grid natural), por isso permite gerar 00:30 -> 01:30.
    
    expect(slots.map((s) => s.startUtc.toISOString())).toEqual([
      "2024-03-10T22:00:00.000Z",
      "2024-03-11T00:30:00.000Z",
    ])
  })
})
