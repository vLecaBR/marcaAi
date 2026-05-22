"use client"

import { useState } from "react"
import { toggleEventTypeAction } from "@/lib/actions/event-types"
import { DeleteDialog } from "./delete-dialog"
import { cn } from "@/lib/utils"
import type { EventTypeInput } from "@/lib/validators/event-type"
import { Card } from "@/components/ui-new/card"
import { Badge } from "@/components/ui-new/badge"
import { Button } from "@/components/ui-new/button"
import { Switch } from "@/components/ui-new/switch"
import { Clock, Copy, ExternalLink, Trash2, MapPin, Video, Phone, Link as LinkIcon } from "lucide-react"

const COLOR_MAP: Record<EventTypeInput["color"], string> = {
  SLATE:   "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  ROSE:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  ORANGE:  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  AMBER:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  EMERALD: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  TEAL:    "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  CYAN:    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  VIOLET:  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  FUCHSIA: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
}

const LOCATION_ICONS: Record<EventTypeInput["locationType"], any> = {
  GOOGLE_MEET: Video,
  ZOOM:        Video,
  TEAMS:       Video,
  PHONE:       Phone,
  IN_PERSON:   MapPin,
  CUSTOM:      LinkIcon,
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
  const absolutePublicUrl = typeof window !== "undefined" ? `${window.location.origin}${publicUrl}` : publicUrl

  async function handleToggle(checked: boolean) {
    setIsToggling(true)
    setIsActive(checked)
    await toggleEventTypeAction(eventType.id, checked)
    setIsToggling(false)
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(absolutePublicUrl)
  }

  const Icon = LOCATION_ICONS[eventType.locationType]

  return (
    <>
      <Card
        className={cn(
          "p-5 rounded-2xl border-border/60 transition group flex flex-col",
          isActive ? "hover:shadow-md" : "opacity-60 grayscale-[30%]"
        )}
      >
        <div className="flex items-start gap-4 flex-1">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${COLOR_MAP[eventType.color]} shrink-0`}>
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{eventType.title}</h3>
              <Badge variant="secondary" className="rounded-full text-xs font-normal">
                <Clock size={11} className="mr-1"/> {eventType.duration} min
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">marcaai.com/{username}/{eventType.slug}</div>
            <div className="text-xs text-muted-foreground mt-2">{eventType._count.bookings} agendamento{eventType._count.bookings !== 1 ? 's' : ''}</div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Switch 
              checked={isActive} 
              onCheckedChange={handleToggle} 
              disabled={isToggling}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14}/>
            </Button>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border/60 flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-lg gap-1.5 flex-1 h-9" onClick={handleCopyLink}>
            <Copy size={13}/> Copiar
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-lg gap-1.5 flex-1 h-9">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13}/> Ver
            </a>
          </Button>
          <Button size="sm" className="rounded-lg flex-1 h-9" onClick={onEdit}>
            Editar
          </Button>
        </div>
      </Card>

      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        eventTypeId={eventType.id}
        eventTypeTitle={eventType.title}
      />
    </>
  )
}