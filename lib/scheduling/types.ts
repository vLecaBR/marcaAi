// lib/scheduling/types.ts

export interface TimeRange {
  start: Date  // sempre UTC internamente
  end: Date
}

export interface DayAvailability {
  date: Date           // dia em questão (meia-noite UTC)
  dayOfWeek: number    // 0–6
  windows: TimeRange[] // janelas disponíveis no dia (UTC)
}

export interface SlotInput {
  userId: string
  eventDuration: number       // minutos
  beforeBuffer: number        // minutos de buffer antes
  afterBuffer: number         // minutos de buffer depois
  dateFrom: Date              // início do período a calcular
  dateTo: Date                // fim do período a calcular
  viewerTimeZone: string      // timezone de quem está vendo
  bookingLimitDays?: number   // máximo de dias à frente permitido
}

export interface Slot {
  startUtc: Date
  endUtc: Date
  startLocal: string   // ISO string no timezone do viewer
  endLocal: string
  available: boolean
}

export interface ScheduleData {
  timeZone: string
  availabilities: {
    dayOfWeek: number
    startTime: string  // "HH:mm"
    endTime: string
  }[]
  exceptions: {
    date: Date
    type: "BLOCKED" | "VACATION" | "OVERRIDE"
    startTime: string | null
    endTime: string | null
  }[]
}

export interface BookingConflict {
  startTime: Date
  endTime: Date
}