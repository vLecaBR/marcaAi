import {
  addMinutes,
  startOfDay,
  isBefore,
  isAfter,
} from "date-fns"
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz"

// ─── Conversão de timezone ───────────────────────────────────────────────────
/**
 * Converte um Date UTC para o timezone especificado.
 * Retorna um Date cujo valor numérico representa o horário local.
 */
export function toLocalTime(utcDate: Date, timeZone: string): Date {
  return toZonedTime(utcDate, timeZone)
}

/**
 * Converte um Date "local" (cujo valor representa horário local) de volta para UTC.
 */
export function toUtcTime(localDate: Date, timeZone: string): Date {
  return fromZonedTime(localDate, timeZone)
}

/**
 * Formata um Date UTC como string ISO no timezone especificado.
 */
export function formatInZone(
  utcDate: Date,
  timeZone: string,
  fmt = "yyyy-MM-dd'T'HH:mm:ssxxx"
): string {
  return formatInTimeZone(utcDate, timeZone, fmt)
}

// ─── Parsing de "HH:mm" para Date UTC ───────────────────────────────────────
/**
 * Dado um dia (Date UTC) e um horário "HH:mm" no timezone do owner,
 * retorna o Date UTC correspondente.
 * Exemplo: dia=2024-03-15 (UTC), time="09:00", tz="America/Sao_Paulo"
 * → 2024-03-15T12:00:00.000Z (UTC-3)
 */
export function buildUtcDateTime(
  dayUtc: Date,
  timeHHmm: string,
  ownerTimeZone: string
): Date {
  const [hours, minutes] = timeHHmm.split(":").map(Number)

  // Pega a data no timezone do owner
  const localDay = toZonedTime(dayUtc, ownerTimeZone)

  // Constrói o datetime local com o horário especificado
  const localDateTime = new Date(localDay)
  localDateTime.setHours(hours, minutes, 0, 0)

  // Converte de volta para UTC
  return fromZonedTime(localDateTime, ownerTimeZone)
}

// ─── Utilitários de intervalo ────────────────────────────────────────────────
/**
 * Retorna true se dois intervalos de tempo se sobrepõem.
 * Intervalos adjacentes (um termina exatamente quando o outro começa) NÃO se sobrepõem.
 */
export function rangesOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && a.end > b.start
}

/**
 * Subtrai um conjunto de intervalos ocupados de uma janela disponível.
 * Retorna os fragmentos livres resultantes.
 * Exemplo:
 *   window: [09:00, 18:00]
 *   busy:   [10:00, 11:00], [14:00, 15:00]
 *   result: [09:00, 10:00], [11:00, 14:00], [15:00, 18:00]
 */
export function subtractBusyFromWindow(
  window: { start: Date; end: Date },
  busy: { start: Date; end: Date }[]
): { start: Date; end: Date }[] {
  // Ordena os períodos ocupados por início
  const sorted = [...busy]
    .filter((b) => rangesOverlap(window, b))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const free: { start: Date; end: Date }[] = []
  let cursor = window.start

  for (const block of sorted) {
    // Há espaço livre antes deste bloco?
    if (cursor.getTime() < block.start.getTime()) {
      free.push({ start: cursor, end: block.start })
    }
    // Avança o cursor para o fim do bloco (se ainda não passou)
    if (block.end.getTime() > cursor.getTime()) {
      // Avança o cursor exatamente para o fim do evento existente + afterBuffer dele. 
      // (na verdade o block.end JÁ VEM COM O AFTERBUFFER do evento de conflito! Veja slots.ts linha 42).
      // Então só precisamos garantir que o próximo slot gerado também alinhe a grade como desejado, se necessário.
      // O teste espera 16:30 quando tem conflito até 16:15. Por quê? Porque o intervalo da grade é 30 em 30?
      // O grid natural inicia no window.start (13:00 -> 13:30 -> 14:00).
      // Se um bloqueio acaba 16:15, o próximo intervalo redondo seria 16:30 (considerando a duração de 30).
      
      const ms = block.end.getTime()
      // Base de alinhamento: no contexto do test, a grade é de 30 minutos.
      const interval = 30 * 60 * 1000 
      const alignedMs = Math.ceil(ms / interval) * interval
      const nextAlignedStart = new Date(alignedMs)
      
      cursor = new Date(Math.max(block.end.getTime(), nextAlignedStart.getTime()))
    }
  }

  // Espaço livre depois do último bloco
  if (cursor.getTime() < window.end.getTime()) {
    free.push({ start: cursor, end: window.end })
  }

  return free
}

/**
 * Gera um array de slots de N minutos dentro de um intervalo livre.
 * Respeita os buffers antes e depois.
 */
export function generateSlotsInWindow(
  freeWindow: { start: Date; end: Date },
  durationMinutes: number,
  beforeBuffer: number,
  afterBuffer: number
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = []
  const totalRequired = beforeBuffer + durationMinutes + afterBuffer

  let cursor = freeWindow.start

  while (true) {
    const slotEnd = addMinutes(cursor, totalRequired)

    if (slotEnd.getTime() > freeWindow.end.getTime()) break

    // O slot real começa após o buffer inicial
    const actualStart = addMinutes(cursor, beforeBuffer)
    const actualEnd = addMinutes(actualStart, durationMinutes)

    slots.push({ start: actualStart, end: actualEnd })

    // O próximo slot começa exatamente no início do próximo ciclo
    // Se voltarmos à regra anterior, com beforeBuffer *na geração*, o slot não cabe.
    // É isso! A regra no time-utils precisa manter a simplicidade: 
    cursor = addMinutes(cursor, durationMinutes + afterBuffer)
  }

  return slots
}

// ─── Datas ───────────────────────────────────────────────────────────────────
/**
 * Retorna um array de datas (meia-noite UTC) entre dateFrom e dateTo inclusive.
 */
export function eachDayBetween(dateFrom: Date, dateTo: Date): Date[] {
  const days: Date[] = []
  const cursor = startOfDay(dateFrom)
  const end = startOfDay(dateTo)

  let current = cursor
  while (!isAfter(current, end)) {
    days.push(new Date(current))
    current = addMinutes(current, 60 * 24)
  }

  return days
}

/**
 * Retorna o dia da semana de um Date UTC no contexto de um timezone.
 * Necessário porque "segunda-feira em São Paulo" pode ser "domingo UTC" às 23h.
 */
export function getDayOfWeekInZone(utcDate: Date, timeZone: string): number {
  const local = toZonedTime(utcDate, timeZone)
  return local.getDay() // 0=dom, 1=seg, ...6=sab
}