import type { Metadata } from "next"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, CalendarClock, CalendarCheck2, CalendarX2, Plus } from "lucide-react"
import { BookingActions } from "./components/booking-actions"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import type { BookingListItemDto } from "@/lib/api/types"

export const metadata: Metadata = { title: "Agendamentos" }

const COLOR_MAP: Record<string, string> = {
  SLATE: "from-slate-500 to-slate-600",
  ROSE: "from-rose-500 to-rose-600",
  ORANGE: "from-orange-500 to-orange-600",
  AMBER: "from-amber-500 to-amber-600",
  EMERALD: "from-emerald-500 to-emerald-600",
  TEAL: "from-teal-500 to-teal-600",
  CYAN: "from-cyan-500 to-cyan-600",
}

type Row = {
  uid: string
  guestName: string
  guestEmail: string
  status: string
  startTime: Date
  eventType: { title: string; color: string; duration: number }
}

/**
 * Agendamentos do profissional — via API .NET (`GET /bookings`).
 * Normaliza `startTime` (ISO string → Date) para a formatação com date-fns.
 */
export default async function BookingsPage() {
  await requireOnboarded()

  const list = await serverApiFetch<BookingListItemDto[]>(endpoints.bookings.root).catch(
    () => [] as BookingListItemDto[],
  )

  const now = new Date()
  const bookings: Row[] = (list ?? []).map((b) => ({
    uid: b.uid,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    status: b.status,
    startTime: new Date(b.startTime),
    eventType: {
      title: b.eventType?.title ?? "Consulta",
      color: b.eventType?.color ?? "TEAL",
      duration: b.eventType?.duration ?? 0,
    },
  }))

  const pending = bookings.filter((b) => b.status === "PENDING" && b.startTime > now)
  const upcoming = bookings
    .filter((b) => b.status === "CONFIRMED" && b.startTime > now)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const past = bookings.filter((b) => b.status === "CONFIRMED" && b.startTime <= now)
  const canceled = bookings.filter(
    (b) => b.status === "CANCELLED" || (b.status === "PENDING" && b.startTime <= now),
  )

  const getInitials = (name: string) =>
    name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()

  const renderRow = (b: Row, type: "upcoming" | "pending" | "past" | "canceled") => {
    const isCanceled = b.status === "CANCELLED"
    const isPending = b.status === "PENDING"

    let badgeText = "Confirmado"
    let badgeClass = "bg-care/10 text-care border-care/20"
    if (isCanceled) {
      badgeText = "Cancelado"
      badgeClass = "bg-destructive/10 text-destructive border-destructive/20"
    } else if (isPending) {
      badgeText = "Pendente"
      badgeClass = "bg-warning/10 text-warning-foreground border-warning/20"
    } else if (type === "past") {
      badgeText = "Passado"
      badgeClass = "bg-muted text-muted-foreground border-border"
    }

    return (
      <div key={b.uid} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-muted/30 transition">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div
            className={`w-11 h-11 rounded-full bg-gradient-to-br ${COLOR_MAP[b.eventType.color] || "from-brand-primary to-care"} shrink-0 flex items-center justify-center text-white text-sm`}
            style={{ fontWeight: 600 }}
          >
            {getInitials(b.guestName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-medium truncate">{b.guestName}</div>
              <Badge variant="outline" className={`rounded-full text-xs font-normal border ${badgeClass}`}>
                {badgeText}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{b.guestEmail}</div>
            <div className="sm:hidden text-sm text-muted-foreground mt-1 truncate">
              {b.eventType.title} · {b.eventType.duration}m
            </div>
          </div>
        </div>

        <div className="hidden sm:block text-sm text-muted-foreground w-1/4 truncate">
          {b.eventType.title} · {b.eventType.duration}m
        </div>

        <div className="text-sm flex items-center gap-1.5 sm:w-1/4 text-muted-foreground">
          <Calendar size={14} className="shrink-0" />
          <span className="truncate">
            {format(b.startTime, "dd MMM", { locale: ptBR })} · {format(b.startTime, "HH:mm")}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {(type === "upcoming" || type === "pending") && (
            <BookingActions uid={b.uid} status={b.status} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Meus agendamentos</h1>
          <p className="text-muted-foreground mt-1">Todas as suas consultas passadas e futuras.</p>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="rounded-xl w-full sm:w-auto overflow-x-auto flex sm:inline-flex no-scrollbar justify-start">
          <TabsTrigger value="upcoming" className="rounded-lg shrink-0">Próximos</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg shrink-0">
            Pendentes
            {pending.length > 0 && (
              <span className="ml-1.5 flex h-2 w-2 rounded-full bg-warning animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="past" className="rounded-lg shrink-0">Passados</TabsTrigger>
          <TabsTrigger value="canceled" className="rounded-lg shrink-0">Cancelados</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhuma consulta futura por aqui"
                description="Quando um paciente marcar um horário, a consulta aparece nesta lista. Compartilhe seu link publicando os tipos de consulta que você atende."
                action={
                  <Button asChild className="rounded-xl">
                    <Link href="/dashboard/event-types">
                      <Plus size={16} /> Criar tipo de consulta
                    </Link>
                  </Button>
                }
              />
            ) : (
              upcoming.map((b) => renderRow(b, "upcoming"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {pending.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nada aguardando aprovação"
                description="As consultas que precisam da sua confirmação aparecem aqui. Por enquanto, está tudo em dia."
              />
            ) : (
              pending.map((b) => renderRow(b, "pending"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="past" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {past.length === 0 ? (
              <EmptyState
                icon={CalendarCheck2}
                title="Ainda sem consultas realizadas"
                description="Seu histórico de atendimentos concluídos vai aparecer aqui conforme as consultas acontecem."
              />
            ) : (
              past.map((b) => renderRow(b, "past"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="canceled" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {canceled.length === 0 ? (
              <EmptyState
                icon={CalendarX2}
                title="Nenhuma consulta cancelada"
                description="Consultas canceladas ou expiradas sem confirmação ficam registradas aqui."
              />
            ) : (
              canceled.map((b) => renderRow(b, "canceled"))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
