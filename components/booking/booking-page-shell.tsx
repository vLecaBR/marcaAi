"use client"

import { useState, useMemo } from "react"
import { addDays, startOfDay } from "date-fns"
import { CalendarPicker } from "./calendar-picker"
import { TimeSlotPicker } from "./time-slot-picker"
import { BookingForm } from "./booking-form"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { computeAvailableSlots, groupSlotsByDate, getAvailableDates } from "@/lib/scheduling/slots"
import type { Slot } from "@/lib/scheduling/types"
import { cn } from "@/lib/utils"

const COLOR_MAP: Record<string, string> = {
  SLATE: "bg-slate-500", ROSE: "bg-rose-500", ORANGE: "bg-orange-500",
  AMBER: "bg-amber-500", EMERALD: "bg-emerald-500", TEAL: "bg-teal-500",
  CYAN: "bg-cyan-500", VIOLET: "bg-violet-500", FUCHSIA: "bg-fuchsia-500",
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet", ZOOM: "Zoom", TEAMS: "Teams",
  PHONE: "Telefone", IN_PERSON: "Presencial", CUSTOM: "Online",
}

type Step = "calendar" | "form"

interface Props {
  eventType: {
    id: string; title: string; description: string | null
    duration: number; color: string; locationType: string
    price: number | null; questions?: any[]
    requiresConfirm: boolean; beforeEventBuffer: number
    afterEventBuffer: number; bookingLimitDays: number | null
  }
  owner: {
    id: string; name: string | null; image: string | null
    username: string; timeZone: string
    theme?: string
    brandColor?: string | null
  }
  schedule: {
    timeZone: string
    availabilities: { dayOfWeek: number; startTime: string; endTime: string }[]
    exceptions: {
      date: Date; type: "BLOCKED" | "VACATION" | "OVERRIDE"
      startTime: string | null; endTime: string | null
    }[]
  }
}

export function BookingPageShell({ eventType, owner, schedule }: Props) {
  const [step, setStep] = useState<Step>("calendar")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Detecta timezone do visitante
  const viewerTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  )

  // Calcula slots para os próximos N dias (pure computation, sem fetch)
  const { groupedSlots, availableDates } = useMemo(() => {
    const dateFrom = startOfDay(new Date())
    const dateTo = addDays(dateFrom, eventType.bookingLimitDays ?? 60)

    const windows = buildAvailableWindows(schedule, dateFrom, dateTo)
    const slots = computeAvailableSlots(windows, [], {
      userId: owner.id,
      eventDuration: eventType.duration,
      beforeBuffer: eventType.beforeEventBuffer,
      afterBuffer: eventType.afterEventBuffer,
      dateFrom,
      dateTo,
      viewerTimeZone,
      bookingLimitDays: eventType.bookingLimitDays ?? undefined,
    })

    return {
      groupedSlots: groupSlotsByDate(slots, viewerTimeZone),
      availableDates: getAvailableDates(slots, viewerTimeZone),
    }
  }, [eventType, owner.id, schedule, viewerTimeZone])

  const slotsForSelectedDate = selectedDate ? (groupedSlots[selectedDate] ?? []) : []

  function handleSelectSlot(slot: Slot) {
    setSelectedSlot(slot)
    setStep("form")
  }

  function handleBack() {
    setSelectedSlot(null)
    setStep("calendar")
  }

  return (
    <div className={cn(
      "flex min-h-screen flex-col items-center justify-start px-4 py-12",
      owner.theme === "LIGHT" ? "text-slate-900" : "text-white"
    )}>
      <div className="w-full max-w-4xl">

        {/* Header do evento */}
        <div className="mb-8 flex items-start gap-5">
          {owner.image ? (
            <img
              src={owner.image}
              alt={owner.name ?? ""}
              className={cn(
                "h-14 w-14 rounded-full ring-2 shrink-0 object-cover",
                owner.theme === "LIGHT" ? "ring-slate-200" : "ring-zinc-800"
              )}
            />
          ) : (
            <div className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
              owner.theme === "LIGHT" ? "bg-slate-200 text-slate-500" : "bg-violet-600/20 text-violet-400"
            )}>
              {owner.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <div className="min-w-0">
            <p className={owner.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"}>{owner.name}</p>
            <h1 className={cn(
              "mt-0.5 text-xl font-semibold",
              owner.theme === "LIGHT" ? "text-slate-900" : "text-white"
            )}>
              {eventType.title}
            </h1>
            <div className={cn(
              "mt-2 flex flex-wrap items-center gap-3 text-xs",
              owner.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"
            )}>
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", COLOR_MAP[eventType.color])} />
                {eventType.duration} min
              </span>
              <span>{LOCATION_LABELS[eventType.locationType]}</span>
              {eventType.requiresConfirm && (
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-400">
                  Confirmação manual
                </span>
              )}
              <span className={owner.theme === "LIGHT" ? "text-slate-400" : "text-zinc-600"}>
                Seu fuso: {viewerTimeZone}
              </span>
            </div>
            {eventType.description && (
              <p className={cn(
                "mt-3 text-sm max-w-lg",
                owner.theme === "LIGHT" ? "text-slate-600" : "text-zinc-400"
              )}>
                {eventType.description}
              </p>
            )}
          </div>
        </div>

        {/* Painel principal */}
        <div className={cn(
          "rounded-2xl border overflow-hidden transition-all",
          owner.theme === "LIGHT" ? "border-slate-200 bg-white shadow-sm" : "border-zinc-800 bg-zinc-900/40"
        )}>
          {step === "calendar" ? (
            <div className="grid lg:grid-cols-[1fr_300px]">
              <div className={cn(
                "border-b p-6 lg:border-b-0 lg:border-r",
                owner.theme === "LIGHT" ? "border-slate-200" : "border-zinc-800"
              )}>
                <p className={cn(
                  "mb-5 text-sm font-medium",
                  owner.theme === "LIGHT" ? "text-slate-700" : "text-zinc-300"
                )}>
                  Selecione uma data
                </p>
                <CalendarPicker
                  availableDates={availableDates}
                  selectedDate={selectedDate}
                  onSelectDate={(d) => {
                    setSelectedDate(d)
                    setSelectedSlot(null)
                  }}
                  bookingLimitDays={eventType.bookingLimitDays ?? 60}
                />
              </div>
              <div className="p-6">
                <TimeSlotPicker
                  slots={slotsForSelectedDate}
                  selectedDate={selectedDate}
                  viewerTimeZone={viewerTimeZone}
                  duration={eventType.duration}
                  onSelectSlot={handleSelectSlot}
                  eventTypeId={eventType.id}
                  ownerId={owner.id}
                />
              </div>
            </div>
          ) : (
            <BookingForm
              slot={selectedSlot!}
              eventType={eventType}
              owner={owner}
              viewerTimeZone={viewerTimeZone}
              onBack={handleBack}
            />
          )}
        </div>

        <p className={cn(
          "mt-8 text-center text-xs",
          owner.theme === "LIGHT" ? "text-slate-400" : "text-zinc-700"
        )}>
          Agendamento via{" "}
          <span className={owner.theme === "LIGHT" ? "text-slate-500 font-medium" : "text-zinc-500 font-medium"}>People OS</span>
        </p>
      </div>
    </div>
  )
}