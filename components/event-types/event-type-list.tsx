"use client"

import { useState } from "react"
import { EventTypeCard } from "./event-type-card"
import { EventTypeForm } from "./event-type-form"
import type { EventTypeInput } from "@/lib/validators/event-type"

type EventType = {
  id: string
  title: string
  slug: string
  description: string | null
  duration: number
  color: EventTypeInput["color"]
  isActive: boolean
  requiresConfirm: boolean
  beforeEventBuffer: number
  afterEventBuffer: number
  bookingLimitDays: number | null
  locationType: EventTypeInput["locationType"]
  locationValue: string | null
  price?: number | null
  questions?: any[]
  _count: { bookings: number }
}

interface EventTypeListProps {
  eventTypes: EventType[]
  username: string
}

export function EventTypeList({ eventTypes, username }: EventTypeListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<EventType | null>(null)

  function handleEdit(et: EventType) {
    setEditing(et)
    setIsFormOpen(true)
  }

  function handleClose() {
    setEditing(null)
    setIsFormOpen(false)
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {eventTypes.map((et) => (
          <EventTypeCard
            key={et.id}
            eventType={et}
            username={username}
            onEdit={() => handleEdit(et)}
          />
        ))}

        {/* Botão de novo evento */}
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-700 bg-transparent text-zinc-500 transition-all hover:border-violet-600/50 hover:bg-violet-600/5 hover:text-violet-400"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-current">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-sm font-medium">Novo tipo de evento</span>
        </button>
      </div>

      <EventTypeForm
        open={isFormOpen}
        onClose={handleClose}
        defaultValues={editing ?? undefined}
      />
    </>
  )
}