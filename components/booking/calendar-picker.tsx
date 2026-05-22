"use client"

import { useState, useMemo } from "react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth,
  isSameDay, isToday, isBefore, startOfDay, format,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui-new/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CalendarPickerProps {
  availableDates: string[]           // "yyyy-MM-dd"
  selectedDate: string | null
  onSelectDate: (date: string) => void
  bookingLimitDays: number
}

export function CalendarPicker({
  availableDates,
  selectedDate,
  onSelectDate,
  bookingLimitDays,
}: CalendarPickerProps) {
  const [viewMonth, setViewMonth] = useState(new Date())

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
    const key = format(date, "yyyy-MM-dd")
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
              className={cn(
                "aspect-square rounded-lg text-sm transition flex items-center justify-center relative",
                !inMonth && "opacity-0 pointer-events-none",
                inMonth && !available && "text-muted-foreground/40 cursor-not-allowed",
                inMonth && available && !selected &&
                  "bg-violet-50 text-violet-700 hover:bg-violet-100 cursor-pointer dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50",
                selected &&
                  "bg-primary text-primary-foreground font-semibold shadow-md"
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