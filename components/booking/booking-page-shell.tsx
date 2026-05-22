"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import type { Slot } from "@/lib/scheduling/types"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui-new/card"
import { Logo } from "@/components/ui-new/logo"
import { Clock, Video, Globe, ArrowLeft, Calendar as CalendarIcon, Phone, MapPin, Link as LinkIcon } from "lucide-react"
import Link from "next/link"

const BookingForm = dynamic(() => import("./booking-form").then(m => m.BookingForm), {
  loading: () => <div className="flex justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" /></div>
})
const TimeSlotPicker = dynamic(() => import("./time-slot-picker").then(m => m.TimeSlotPicker), {
  loading: () => <div className="flex justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" /></div>
})
const CalendarPicker = dynamic(() => import("./calendar-picker").then(m => m.CalendarPicker), {
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-muted/50" />
})

const LOCATION_LABELS: Record<string, { label: string, icon: React.ElementType }> = {
  GOOGLE_MEET: { label: "Google Meet", icon: Video },
  ZOOM: { label: "Zoom", icon: Video },
  TEAMS: { label: "Teams", icon: Video },
  PHONE: { label: "Telefone", icon: Phone },
  IN_PERSON: { label: "Presencial", icon: MapPin },
  CUSTOM: { label: "Online", icon: LinkIcon },
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
  initialAvailableDates: string[]
}

export function BookingPageShell({ eventType, owner, schedule, initialAvailableDates }: Props) {
  const [step, setStep] = useState<Step>("calendar")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [viewerTimeZone, setViewerTimeZone] = useState(owner.timeZone)
  const [groupedSlots, setGroupedSlots] = useState<Record<string, Slot[]>>({})
  const [availableDates, setAvailableDates] = useState(initialAvailableDates)

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (tz !== owner.timeZone) {
        setViewerTimeZone(tz)

        // dynamically load heavy logic only if timezone differs
        Promise.all([
          import("date-fns"),
          import("@/lib/scheduling/availability"),
          import("@/lib/scheduling/slots")
        ]).then(([dateFns, availability, slotsMod]) => {
          const dateFrom = dateFns.startOfDay(new Date())
          const dateTo = dateFns.addDays(dateFrom, eventType.bookingLimitDays ?? 60)

          const windows = availability.buildAvailableWindows(schedule, dateFrom, dateTo)
          const slots = slotsMod.computeAvailableSlots(windows, [], {
            userId: owner.id,
            eventDuration: eventType.duration,
            beforeBuffer: eventType.beforeEventBuffer,
            afterBuffer: eventType.afterEventBuffer,
            dateFrom,
            dateTo,
            viewerTimeZone: tz,
            bookingLimitDays: eventType.bookingLimitDays ?? undefined,
          })

          setGroupedSlots(slotsMod.groupSlotsByDate(slots, tz))
          setAvailableDates(slotsMod.getAvailableDates(slots, tz))
        })
      }
    } catch (e) {
      // Ignora erro se Intl não estiver disponível
    }
  }, [owner.timeZone, owner.id, eventType, schedule])

  const slotsForSelectedDate = selectedDate ? (groupedSlots[selectedDate] ?? []) : []

  function handleSelectSlot(slot: Slot) {
    setSelectedSlot(slot)
    setStep("form")
  }

  function handleBack() {
    setSelectedSlot(null)
    setStep("calendar")
  }

  const LocIcon = LOCATION_LABELS[eventType.locationType]?.icon ?? MapPin
  const locLabel = LOCATION_LABELS[eventType.locationType]?.label ?? "Local"
  
  const userInitials = owner.name?.[0]?.toUpperCase() ?? "U"

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="px-6 py-5 bg-background border-b border-border/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href={`/${owner.username}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Voltar
          </Link>
          <Link href="/">
            <Logo size={22} />
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <Card className="rounded-2xl border-border/60 overflow-hidden shadow-sm p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            {/* Left: event details */}
            <div className="p-7 border-b lg:border-b-0 lg:border-r border-border/60 bg-card">
              {owner.image ? (
                <Image
                  src={owner.image}
                  alt={owner.name ?? ""}
                  width={48}
                  height={48}
                  priority={true}
                  className="w-12 h-12 rounded-full ring-2 ring-background shrink-0 object-cover mb-4"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white mb-4" style={{ fontWeight: 600 }}>
                  {userInitials}
                </div>
              )}
              <div className="text-sm text-muted-foreground">{owner.name}</div>
              <h2 className="mt-1" style={{ fontSize: 22, fontWeight: 600 }}>
                {eventType.title}
              </h2>

              <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <Clock size={16} /> {eventType.duration} minutos
                </div>
                <div className="flex items-center gap-2.5">
                  <LocIcon size={16} /> {locLabel}
                </div>
                <div className="flex items-center gap-2.5">
                  <Globe size={16} /> {viewerTimeZone}
                </div>
                {selectedSlot && (
                  <div className="flex items-center gap-2.5 text-foreground pt-2 mt-2 border-t border-border">
                    <CalendarIcon size={16} className="text-primary" />
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: viewerTimeZone }).format(new Date(selectedSlot.start))}
                  </div>
                )}
              </div>

              {eventType.description && (
                <p className="mt-6 text-sm text-muted-foreground whitespace-pre-wrap" style={{ lineHeight: 1.6 }}>
                  {eventType.description}
                </p>
              )}
            </div>

            {/* Right: calendar + slots, or form */}
            {step === "calendar" ? (
              <div className="p-7 grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6">
                <div>
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

                <div>
                  <div className="text-sm mb-3" style={{ fontWeight: 600 }}>
                    {selectedDate ? new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(selectedDate + 'T00:00:00')) : "Escolha um dia"}
                  </div>
                  {!selectedDate ? (
                     <div className="text-sm text-muted-foreground">Selecione uma data no calendário.</div>
                  ) : (
                    <TimeSlotPicker
                      slots={slotsForSelectedDate}
                      selectedDate={selectedDate}
                      viewerTimeZone={viewerTimeZone}
                      duration={eventType.duration}
                      onSelectSlot={handleSelectSlot}
                      eventTypeId={eventType.id}
                      ownerId={owner.id}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="p-7">
                <BookingForm
                  slot={selectedSlot!}
                  eventType={eventType}
                  owner={owner}
                  viewerTimeZone={viewerTimeZone}
                  onBack={handleBack}
                />
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  )
}