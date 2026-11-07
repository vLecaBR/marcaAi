"use client"

import { useState, useMemo, useEffect } from "react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth,
  isSameDay, isToday, isBefore, startOfDay, format,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CalendarPickerProps {
  availableDates: string[]           // "yyyy-MM-dd"
  selectedDate: string | null
  onSelectDate: (date: string) => void
  bookingLimitDays: number
  /** Com estes três, o calendário só habilita os dias do mês que têm horário livre (GET /api/slots/month). */
  ownerId?: string
  eventTypeId?: string
  viewerTimeZone?: string
}

export function CalendarPicker({
  availableDates,
  selectedDate,
  onSelectDate,
  bookingLimitDays,
  ownerId,
  eventTypeId,
  viewerTimeZone,
}: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(new Date())
  // Dias com horário do mês exibido (null = ainda carregando ou indisponível → comportamento antigo).
  const [monthDays, setMonthDays] = useState<Set<string> | null>(null)
  const [monthLoading, setMonthLoading] = useState(false)

  useEffect(() => {
    if (!ownerId || !eventTypeId) return
    let cancelled = false
    setMonthLoading(true)
    setMonthDays(null)
    const month = format(viewMonth, "yyyy-MM")
    fetch(`/api/slots/month?ownerId=${ownerId}&eventTypeId=${eventTypeId}&month=${month}&tz=${encodeURIComponent(viewerTimeZone ?? "UTC")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { days?: string[] } | null) => {
        if (!cancelled && d?.days) setMonthDays(new Set(d.days))
      })
      .catch(() => { /* sem a lista, habilita todos os dias (o dia vazio avisa ao abrir) */ })
      .finally(() => { if (!cancelled) setMonthLoading(false) })
    return () => { cancelled = true }
  }, [ownerId, eventTypeId, viewerTimeZone, viewMonth])

  const today = startOfDay(new Date())
  const maxDate = addDays(today, bookingLimitDays)

  const availableSet = useMemo(
    () => new Set(availableDates),
    [availableDates]
  )

  // Gera as células do calendário
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 })
    const end   = endOfWeek(endOfMonth(viewMonth),     { weekStartsOn: 0 })
    const days: Date[] = []
    let cursor = start
    while (!isBefore(end, cursor)) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [viewMonth])

  function isDateAvailable(date: Date): boolean {
    if (isBefore(date, today)) return false
    if (isBefore(maxDate, date)) return false
    // Sem lista pré-computada (API-driven): habilita todos os dias no horizonte; o dia sem
    // horários mostra "sem horários" ao ser aberto. Com lista, respeita-a.
    const key = format(date, "yyyy-MM-dd")
    if (monthLoading && ownerId) return false
    if (monthDays) return monthDays.has(key)
    if (availableSet.size === 0) return true
    return availableSet.has(key)
  }

  function isDateSelected(date: Date): boolean {
    if (!selectedDate) return false
    return format(date, "yyyy-MM-dd") === selectedDate
  }

  return (
    <div className="w-full select-none">
      {/* Navegação de mês */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold capitalize text-foreground">
          {format(viewMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            disabled={isSameMonth(viewMonth, today)}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {monthDays && monthDays.size === 0 && !monthLoading && (
        <p className="mb-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Sem horários livres neste mês. Veja o mês seguinte.
        </p>
      )}

      {/* Células */}
      <div className="grid grid-cols-7 gap-1.5">
        {/* Cabeçalho dias da semana */}
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-xs text-muted-foreground py-1.5">
            {d}
          </div>
        ))}
        {calendarDays.map((date, idx) => {
          const inMonth   = isSameMonth(date, viewMonth)
          const available = isDateAvailable(date)
          const selected  = isDateSelected(date)
          const dateKey   = format(date, "yyyy-MM-dd")

          return (
            <button
              key={idx}
              disabled={!available || !inMonth}
              onClick={() => onSelectDate(dateKey)}
              style={selected ? { background: "var(--brand)" } : undefined}
              className={cn(
                "aspect-square rounded-lg text-sm transition flex items-center justify-center relative",
                !inMonth && "opacity-0 pointer-events-none",
                inMonth && !available && "text-muted-foreground/40 cursor-not-allowed",
                inMonth && available && !selected &&
                  "bg-[var(--brand)]/10 text-foreground hover:bg-[var(--brand)]/20 cursor-pointer",
                selected &&
                  "text-white font-semibold shadow-md"
              )}
            >
              {format(date, "d")}
            </button>
          )
        })}
      </div>
    </div>
  )
}