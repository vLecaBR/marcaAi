"use client"

/**
 * Remarcar consulta: escolhe um novo dia/horário (mesmo calendário e seletor do agendamento) e confirma.
 * Paciente: até 24h antes e no máximo 2 vezes. O profissional logado remarca sem esses limites (a API decide pela sessão).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatInTimeZone } from "date-fns-tz"
import { CalendarPicker } from "@/components/booking/calendar-picker"
import { TimeSlotPicker } from "@/components/booking/time-slot-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Slot } from "@/lib/api/booking-types"

interface Props {
  uid: string
  ownerId: string
  eventTypeId: string
  eventTitle: string
  ownerName: string | null
  duration: number
  currentStartUtc: string
  guestTimeZone: string
  bookingLimitDays: number
  rescheduleCount: number
}

export function RescheduleClient({
  uid, ownerId, eventTypeId, eventTitle, ownerName, duration, currentStartUtc, guestTimeZone, bookingLimitDays, rescheduleCount,
}: Props) {
  const router = useRouter()
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fmt = (iso: string) => formatInTimeZone(iso, guestTimeZone, "dd/MM/yyyy 'às' HH:mm")

  async function confirm() {
    if (!slot) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/book/${uid}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ startTimeUtc: new Date(slot.startUtc).toISOString(), endTimeUtc: new Date(slot.endUtc).toISOString() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Não foi possível remarcar.")
        setBusy(false)
        return
      }
      router.replace(`/booking/${uid}?remarcada=1`)
    } catch {
      setError("Falha de conexão. Tente novamente.")
      setBusy(false)
    }
  }

  return (
    <Card className="rounded-2xl border-border/60 p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Remarcar consulta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {eventTitle}{ownerName ? ` com ${ownerName}` : ""} · atualmente em <b>{fmt(currentStartUtc)}</b> ({duration} min)
      </p>
      {rescheduleCount > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Esta consulta já foi remarcada {rescheduleCount}x.</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_180px]">
        <CalendarPicker
          availableDates={[]}
          ownerId={ownerId}
          eventTypeId={eventTypeId}
          viewerTimeZone={guestTimeZone}
          selectedDate={date}
          onSelectDate={(d) => { setDate(d); setSlot(null) }}
          bookingLimitDays={bookingLimitDays}
        />
        <div>
          <div className="mb-3 text-sm font-semibold">{date ? date.split("-").reverse().join("/") : "Escolha um dia"}</div>
          {date ? (
            <TimeSlotPicker
              slots={[]}
              selectedDate={date}
              viewerTimeZone={guestTimeZone}
              duration={duration}
              onSelectSlot={setSlot}
              eventTypeId={eventTypeId}
              ownerId={ownerId}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Selecione uma data.</p>
          )}
        </div>
      </div>

      {slot && (
        <div className="mt-6 rounded-xl bg-muted/40 p-4 text-sm">
          Novo horário: <b>{fmt(slot.startUtc)}</b>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <Button onClick={confirm} disabled={!slot || busy} className="mt-6 h-11 w-full rounded-xl" data-testid="confirm-reschedule">
        {busy ? "Remarcando…" : "Confirmar novo horário"}
      </Button>
    </Card>
  )
}
