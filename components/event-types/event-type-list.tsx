"use client"

import { useState } from "react"
import { EventTypeCard } from "./event-type-card"
import { EventTypeForm } from "./event-type-form"
import type { EventTypeInput } from "@/lib/validators/event-type"
import { Card } from "@/components/ui-new/card"
import { Plus } from "lucide-react"

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
  teamId?: string | null
  _count: { bookings: number }
}

interface EventTypeListProps {
  eventTypes: EventType[]
  username: string
  teams?: { id: string, name: string }[]
}

export function EventTypeList({ eventTypes, username, teams = [] }: EventTypeListProps) {
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
        <Card 
          onClick={() => setIsFormOpen(true)}
          className="p-5 rounded-2xl border-dashed border-2 border-border hover:border-primary/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition cursor-pointer flex flex-col items-center justify-center min-h-[180px] text-muted-foreground shadow-none"
        >
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Plus size={20}/>
          </div>
          <div className="text-sm font-medium">Criar novo tipo de evento</div>
        </Card>
      </div>

      <EventTypeForm
        open={isFormOpen}
        onClose={handleClose}
        defaultValues={editing ?? undefined}
        userTeams={teams}
      />
    </>
  )
}