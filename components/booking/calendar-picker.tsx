"use client"

import { useState, useMemo } from "react"
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth,
  isSameDay, isToday, isBefore, startOfDay, format,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

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
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          disabled={isSameMonth(viewMonth, today)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        <span className="text-sm font-medium capitalize text-white">
          {format(viewMonth, "MMMM yyyy", { locale: ptBR })}
        </span>

        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Cabeçalho dias da semana */}
      <div className="mb-2 grid grid-cols-7 text-center">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="py-1 text-xs font-medium text-zinc-600">
            {d}
          </div>
        ))}
      </div>

      {/* Células */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((date, idx) => {
          const inMonth   = isSameMonth(date, viewMonth)
          const available = isDateAvailable(date)
          const selected  = isDateSelected(date)
          const todayDate = isToday(date)
          const dateKey   = format(date, "yyyy-MM-dd")

          return (
            <button
              key={idx}
              disabled={!available || !inMonth}
              onClick={() => onSelectDate(dateKey)}
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-lg text-sm transition-all",
                !inMonth && "opacity-0 pointer-events-none",
                inMonth && !available && "text-zinc-700 cursor-default",
                inMonth && available && !selected &&
                  "text-white hover:bg-zinc-800 cursor-pointer font-medium",
                selected &&
                  "bg-violet-600 text-white font-semibold shadow-lg shadow-violet-600/20",
                todayDate && !selected &&
                  "ring-1 ring-zinc-600"
              )}
            >
              {format(date, "d")}
              {available && !selected && inMonth && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-500 opacity-70" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}