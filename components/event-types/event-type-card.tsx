"use client"

import { useState } from "react"
import { toggleEventTypeAction } from "@/lib/actions/event-types"
import { DeleteDialog } from "./delete-dialog"
import { cn } from "@/lib/utils"
import type { EventTypeInput } from "@/lib/validators/event-type"

const COLOR_MAP: Record<EventTypeInput["color"], string> = {
  SLATE:   "bg-slate-500",
  ROSE:    "bg-rose-500",
  ORANGE:  "bg-orange-500",
  AMBER:   "bg-amber-500",
  EMERALD: "bg-emerald-500",
  TEAL:    "bg-teal-500",
  CYAN:    "bg-cyan-500",
  VIOLET:  "bg-violet-500",
  FUCHSIA: "bg-fuchsia-500",
}

const LOCATION_LABELS: Record<EventTypeInput["locationType"], string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM:        "Zoom",
  TEAMS:       "Teams",
  PHONE:       "Telefone",
  IN_PERSON:   "Presencial",
  CUSTOM:      "Personalizado",
}

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
  _count: { bookings: number }
}

interface EventTypeCardProps {
  eventType: EventType
  username: string
  onEdit: () => void
}

export function EventTypeCard({ eventType, username, onEdit }: EventTypeCardProps) {
  const [isActive, setIsActive] = useState(eventType.isActive)
  const [isToggling, setIsToggling] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const publicUrl = `/${username}/${eventType.slug}`

  async function handleToggle() {
    setIsToggling(true)
    const next = !isActive
    setIsActive(next)
    await toggleEventTypeAction(eventType.id, next)
    setIsToggling(false)
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col rounded-2xl border bg-zinc-900 p-5 transition-all",
          isActive
            ? "border-zinc-800 hover:border-zinc-700"
            : "border-zinc-800/50 opacity-60"
        )}
      >
        {/* Color dot + toggle */}
        <div className="mb-4 flex items-center justify-between">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              COLOR_MAP[eventType.color]
            )}
          />
          <button
            onClick={handleToggle}
            disabled={isToggling}
            className="relative inline-flex cursor-pointer items-center"
            aria-label={isActive ? "Desativar" : "Ativar"}
          >
            <div
              className={cn(
                "h-5 w-9 rounded-full border transition-all",
                isActive
                  ? "bg-violet-600 border-violet-600"
                  : "bg-zinc-700 border-zinc-600"
              )}
            />
            <div
              className={cn(
                "absolute h-4 w-4 rounded-full bg-white shadow transition-all",
                isActive ? "left-4.5" : "left-0.5"
              )}
            />
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-1">
          <h3 className="font-medium text-white leading-tight">
            {eventType.title}
          </h3>
          {eventType.description && (
            <p className="text-xs text-zinc-500 line-clamp-2">
              {eventType.description}
            </p>
          )}
        </div>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {eventType.duration} min
          </span>
          <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
            {LOCATION_LABELS[eventType.locationType]}
          </span>
          {eventType.requiresConfirm && (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              Confirmação manual
            </span>
          )}
        </div>

        {/* Bookings count */}
        <p className="mt-3 text-xs text-zinc-600">
          {eventType._count.bookings} agendamento{eventType._count.bookings !== 1 ? "s" : ""}
        </p>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-zinc-800 pt-4">
          <button
            onClick={onEdit}
            className="flex-1 rounded-lg border border-zinc-700 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:text-white"
          >
            Editar
          </button>
          
          {/* Faltava o <a bem aqui 👇 */}
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-zinc-700 bg-transparent px-3 py-1.5 text-center text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:text-white"
          >
            Ver página
          </a>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 text-zinc-500 transition-all hover:border-rose-500/50 hover:text-rose-400"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        eventTypeId={eventType.id}
        eventTypeTitle={eventType.title}
      />
    </>
  )
}