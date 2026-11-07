"use client"

/**
 * Linha de serviço no formato de lista limpa (densa, estilo sistema clínico).
 * Substitui o card volumoso. Mantém as ações: ativar/desativar, copiar link, ver, editar, excluir.
 */

import { useState } from "react"
import { toast } from "sonner"
import { toggleEventTypeAction } from "@/lib/actions/event-types"
import { DeleteDialog } from "./delete-dialog"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Clock, Copy, ExternalLink, Trash2, Pencil, MapPin, Video, Phone, Link as LinkIcon,
} from "lucide-react"

const COLOR_DOT: Record<string, string> = {
  SLATE: "bg-slate-400", ROSE: "bg-rose-400", ORANGE: "bg-orange-400", AMBER: "bg-amber-400",
  EMERALD: "bg-emerald-400", TEAL: "bg-brand-primary", CYAN: "bg-cyan-400",
}

const LOCATION_ICONS: Record<string, React.ElementType> = {
  GOOGLE_MEET: Video, ZOOM: Video, TEAMS: Video, PHONE: Phone, IN_PERSON: MapPin, CUSTOM: LinkIcon,
}

type EventTypeRowData = {
  id: string
  title: string
  slug: string
  duration: number
  color: string
  isActive: boolean
  locationType: string
  price?: number | null
  payOnSite?: boolean
  _count: { bookings: number }
}

export function EventTypeRow({
  eventType,
  username,
  onEdit,
}: {
  eventType: EventTypeRowData
  username: string
  onEdit: () => void
}) {
  const [isActive, setIsActive] = useState(eventType.isActive)
  const [toggling, setToggling] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const publicUrl = `/${username}/${eventType.slug}`
  const LocIcon = LOCATION_ICONS[eventType.locationType] ?? MapPin

  async function handleToggle(checked: boolean) {
    setToggling(true)
    setIsActive(checked)
    const res = await toggleEventTypeAction(eventType.id, checked)
    if (!res.success) {
      setIsActive(!checked)
      toast.error(res.error)
    }
    setToggling(false)
  }

  function copyLink() {
    const abs = typeof window !== "undefined" ? `${window.location.origin}${publicUrl}` : publicUrl
    navigator.clipboard.writeText(abs)
    toast.success("Link copiado.")
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/40",
          !isActive && "opacity-55",
        )}
      >
        {/* Cor + ícone de local */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_DOT[eventType.color] ?? "bg-brand-primary")} />
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LocIcon size={16} />
          </div>
        </div>

        {/* Título + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{eventType.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock size={11} /> {eventType.duration} min</span>
            <span className="hidden sm:inline truncate font-mono">/{username}/{eventType.slug}</span>
            <span className="hidden md:inline">{eventType._count.bookings} agendamento{eventType._count.bookings !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Preço */}
        {eventType.price ? (
          <div className="hidden sm:block shrink-0 text-sm font-medium text-foreground tabular-nums">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(eventType.price / 100)}
            <span className="block text-[10px] font-normal text-muted-foreground">
              {eventType.payOnSite ? "cobrado no local" : "pago online"}
            </span>
          </div>
        ) : (
          <div className="hidden sm:block shrink-0 text-xs text-muted-foreground">Gratuito</div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={isActive} onCheckedChange={handleToggle} disabled={toggling} className="mr-1" />
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground" onClick={copyLink} title="Copiar link">
            <Copy size={14} />
          </Button>
          <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground" title="Ver página">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground" onClick={onEdit} title="Editar">
            <Pencil size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
            title="Excluir"
          >
            <Trash2 size={14} />
          </Button>
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
