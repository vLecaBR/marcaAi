"use client"

/**
 * Lista de serviços (tipos de consulta) em formato de **lista limpa e densa** (estilo sistema
 * clínico), em vez de cards volumosos. Cada linha é um `EventTypeRow`.
 */

import { useState } from "react"
import { EventTypeRow } from "./event-type-row"
import { EventTypeForm } from "./event-type-form"
import type { EventTypeInput } from "@/lib/validators/event-type"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Plus, CalendarPlus } from "lucide-react"

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
  payOnSite?: boolean
  questions?: EventTypeInput["questions"]
  teamId?: string | null
  _count: { bookings: number }
}

interface EventTypeListProps {
  eventTypes: EventType[]
  username: string
  teams?: { id: string; name: string }[]
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
      <div className="flex justify-end">
        <Button onClick={() => setIsFormOpen(true)} className="rounded-xl h-10 gap-1.5">
          <Plus size={16} /> Novo serviço
        </Button>
      </div>

      {eventTypes.length === 0 ? (
        <Card className="mt-4 rounded-2xl border-2 border-dashed border-border shadow-none">
          <EmptyState
            icon={CalendarPlus}
            title="Nenhum serviço cadastrado ainda"
            description="Crie seu primeiro tipo de consulta — com duração, local e preço — para começar a receber agendamentos."
            action={
              <Button onClick={() => setIsFormOpen(true)} className="rounded-xl gap-1.5">
                <Plus size={16} /> Criar primeira consulta
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="mt-4 rounded-2xl border-border/60 shadow-sm overflow-hidden divide-y divide-border/60">
          {eventTypes.map((et) => (
            <EventTypeRow key={et.id} eventType={et} username={username} onEdit={() => handleEdit(et)} />
          ))}
        </Card>
      )}

      <EventTypeForm
        open={isFormOpen}
        onClose={handleClose}
        defaultValues={editing ?? undefined}
        userTeams={teams}
      />
    </>
  )
}
