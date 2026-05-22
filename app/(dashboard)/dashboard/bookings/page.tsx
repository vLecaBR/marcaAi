import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Calendar, Clock, Video, MoreHorizontal, XCircle } from "lucide-react"
import { BookingActions } from "./components/booking-actions"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Agendamentos | Marca AI" }

const COLOR_MAP: Record<string, string> = {
  SLATE: "from-slate-500 to-slate-600",
  ROSE: "from-rose-500 to-rose-600",
  ORANGE: "from-orange-500 to-orange-600",
  AMBER: "from-amber-500 to-amber-600",
  EMERALD: "from-emerald-500 to-emerald-600",
  TEAL: "from-teal-500 to-teal-600",
  CYAN: "from-cyan-500 to-cyan-600",
  VIOLET: "from-violet-500 to-violet-600",
  FUCHSIA: "from-fuchsia-500 to-fuchsia-600",
}

export default async function BookingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
    include: {
      eventType: {
        select: { title: true, color: true, locationType: true, duration: true },
      },
    },
  })

  // Separa os bookings
  const pending = bookings.filter((b: any) => b.status === "PENDING" && b.startTime > new Date())
  const upcoming = bookings.filter((b: any) => b.status === "CONFIRMED" && b.startTime > new Date()).sort((a: any, b: any) => a.startTime.getTime() - b.startTime.getTime())
  const past = bookings.filter((b: any) => b.status === "CONFIRMED" && b.startTime <= new Date())
  const canceled = bookings.filter((b: any) => b.status === "CANCELLED" || (b.status === "PENDING" && b.startTime <= new Date()))

  const getInitials = (name: string) => name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()

  const renderBookingRow = (b: any, type: "upcoming" | "pending" | "past" | "canceled") => {
    const isConfirmed = b.status === "CONFIRMED"
    const isPending = b.status === "PENDING"
    const isCanceled = b.status === "CANCELLED"
    
    let badgeText = ""
    let badgeClass = ""
    
    if (isCanceled) {
      badgeText = "Cancelado"
      badgeClass = "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-900"
    } else if (isPending) {
      badgeText = "Pendente"
      badgeClass = "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-900"
    } else if (type === "past") {
      badgeText = "Passado"
      badgeClass = "bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800"
    } else {
      badgeText = "Confirmado"
      badgeClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
    }

    return (
      <div key={b.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-muted/30 transition">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${COLOR_MAP[b.eventType.color] || "from-violet-500 to-fuchsia-500"} shrink-0 flex items-center justify-center text-white text-sm`} style={{ fontWeight: 600 }}>
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
            
            {/* Show on mobile, hide on desktop */}
            <div className="sm:hidden text-sm text-muted-foreground mt-1 truncate">{b.eventType.title} · {b.eventType.duration}m</div>
          </div>
        </div>
        
        {/* Show on desktop, hide on mobile */}
        <div className="hidden sm:block text-sm text-muted-foreground w-1/4 truncate">{b.eventType.title} · {b.eventType.duration}m</div>
        
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
          <p className="text-muted-foreground mt-1">Todas as suas reuniões passadas e futuras.</p>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="rounded-xl w-full sm:w-auto overflow-x-auto flex sm:inline-flex no-scrollbar justify-start">
          <TabsTrigger value="upcoming" className="rounded-lg shrink-0">Próximos</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg shrink-0">
            Pendentes
            {pending.length > 0 && (
              <span className="ml-1.5 flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="past" className="rounded-lg shrink-0">Passados</TabsTrigger>
          <TabsTrigger value="canceled" className="rounded-lg shrink-0">Cancelados</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {upcoming.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <Calendar className="mx-auto mb-3 text-muted-foreground" size={32}/>
                <p className="text-muted-foreground text-sm">Nenhum agendamento confirmado para o futuro.</p>
              </div>
            ) : (
              upcoming.map(b => renderBookingRow(b, "upcoming"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {pending.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <Clock className="mx-auto mb-3 text-muted-foreground" size={32}/>
                <p className="text-muted-foreground text-sm">Nenhum agendamento aguardando aprovação.</p>
              </div>
            ) : (
              pending.map(b => renderBookingRow(b, "pending"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="past" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {past.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <Calendar className="mx-auto mb-3 text-muted-foreground opacity-50" size={32}/>
                <p className="text-muted-foreground text-sm">Nenhuma reunião passada encontrada.</p>
              </div>
            ) : (
              past.map(b => renderBookingRow(b, "past"))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="canceled" className="mt-5 outline-none">
          <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
            {canceled.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <XCircle className="mx-auto mb-3 text-muted-foreground" size={32}/>
                <p className="text-muted-foreground text-sm">Nenhum agendamento cancelado.</p>
              </div>
            ) : (
              canceled.map(b => renderBookingRow(b, "canceled"))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}