import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import type { BookingListItemDto } from "@/lib/api/types"
import Link from "next/link"
import type { Metadata } from "next"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CopyLinkButton } from "@/components/dashboard/copy-link-button"
import { Stagger, StaggerItem } from "@/components/motion/primitives"
import { Calendar, Clock, Video, Users, CheckCircle2, ArrowUpRight } from "lucide-react"
import { isToday, isTomorrow, format } from "date-fns"

export const metadata: Metadata = { title: "Dashboard" }

const COLOR_MAP: Record<string, string> = {
  SLATE:   "from-slate-500 to-slate-600",
  ROSE:    "from-rose-500 to-rose-600",
  ORANGE:  "from-orange-500 to-orange-600",
  AMBER:   "from-amber-500 to-amber-600",
  EMERALD: "from-emerald-500 to-emerald-600",
  TEAL:    "from-teal-500 to-teal-600",
  CYAN:    "from-cyan-500 to-cyan-600",
}

export default async function DashboardPage() {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()))
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  const user = await requireOnboarded()

  // Fonte única: API .NET (`GET /bookings`). Stats e próximas consultas derivam desta lista.
  const list = await serverApiFetch<BookingListItemDto[]>(endpoints.bookings.root).catch(
    () => [] as BookingListItemDto[],
  )
  const now = new Date()
  const all = (list ?? []).map((b) => ({
    uid: b.uid,
    guestName: b.guestName,
    status: b.status,
    startTime: new Date(b.startTime),
    eventType: { title: b.eventType?.title ?? "Consulta", color: b.eventType?.color ?? "TEAL" },
  }))

  const totalBookings = all.length
  const confirmedCount = all.filter((b) => b.status === "CONFIRMED").length
  const pendingCount = all.filter((b) => b.status === "PENDING").length
  const cancelledCount = all.filter((b) => b.status === "CANCELLED").length

  const upcomingBookings = all
    .filter((b) => (b.status === "CONFIRMED" || b.status === "PENDING") && b.startTime >= now)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 5)

  const todayCount = upcomingBookings.filter((b) => isToday(b.startTime)).length

  // Nome de exibição real (ex.: "Dr teste"); só cai no handle/e-mail se o nome não existir.
  const firstName = user.name ?? user.username ?? user.email.split("@")[0]
  const username  = user.username

  const publicLink = username ? `marca-ai-app.vercel.app/${username}` : ""

  const formatBookingTime = (date: Date) => {
    if (isToday(date)) return `Hoje · ${format(date, "HH:mm")}`
    if (isTomorrow(date)) return `Amanhã · ${format(date, "HH:mm")}`
    return format(date, "dd/MM · HH:mm")
  }

  const getInitials = (name: string) => {
    return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>{greeting}, {firstName} 👋</h1>
          <p className="text-muted-foreground mt-1">
            {todayCount > 0 ? `Você tem ${todayCount} consulta${todayCount === 1 ? '' : 's'} marcada${todayCount === 1 ? '' : 's'} para hoje.` : "Você não tem consultas marcadas para hoje."}
          </p>
        </div>
        <Button asChild className="rounded-xl h-10 shrink-0">
          <Link href="/dashboard/event-types">+ Novo serviço</Link>
        </Button>
      </div>

      <Stagger className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total de agendamentos", value: totalBookings.toString(), icon: Calendar, color: "bg-secondary text-brand-primary" },
          { label: "Confirmados", value: confirmedCount.toString(), icon: CheckCircle2, color: "bg-care/15 text-care" },
          { label: "Pendentes", value: pendingCount.toString(), icon: Clock, color: "bg-warning/15 text-warning-foreground" },
          { label: "Cancelados", value: cancelledCount.toString(), icon: Users, color: "bg-destructive/15 text-destructive" },
        ].map((s) => (
          <StaggerItem key={s.label}>
            <Card className="p-5 rounded-2xl border-border/60 shadow-sm h-full">
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon size={18} />
                </div>
              </div>
              <div className="mt-4" style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-6 rounded-2xl border-border/60 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-lg">Próximas consultas</h2>
            <Link href="/dashboard/bookings" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              Ver todas <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {upcomingBookings.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center bg-muted/30 rounded-xl">
                Nenhuma consulta próxima.
              </div>
            ) : (
              upcomingBookings.map((m) => (
                <div key={m.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${COLOR_MAP[m.eventType.color] || "from-brand-primary to-care"} shrink-0 flex items-center justify-center text-white text-sm`} style={{ fontWeight: 600 }}>
                      {getInitials(m.guestName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ fontWeight: 500 }}>{m.guestName}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.eventType.title}</div>
                    </div>
                  </div>
                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 mt-2 sm:mt-0 pl-13 sm:pl-0">
                    <div className="text-sm font-medium">{formatBookingTime(m.startTime)}</div>
                    <Link href={`/dashboard/bookings`} className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5">
                      <Video size={11}/> Detalhes
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl border-border/60 bg-gradient-to-br from-brand-primary to-brand-secondary text-white shadow-sm flex flex-col">
          <h2 className="text-white font-semibold text-lg">Seu link de agendamento</h2>
          <p className="text-white/80 text-sm mt-1.5 flex-1">Compartilhe em todo lugar onde alguém possa querer marcar um horário com você.</p>
          <div className="mt-5 p-3 rounded-xl bg-white/15 backdrop-blur-sm font-mono text-sm break-all">
            {publicLink || "Configure seu perfil"}
          </div>
          <div className="mt-4 flex gap-2">
            <CopyLinkButton link={publicLink} />
            {username && (
              <Button asChild variant="secondary" className="flex-1 rounded-xl text-primary font-medium hover:bg-white/90">
                <Link href={`/${username}`} target="_blank">Acessar</Link>
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}