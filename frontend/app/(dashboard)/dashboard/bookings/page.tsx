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
import { Input } from "@/components/ui/input"
import { ListPager } from "@/components/dashboard/list-pager"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import type { BookingSummaryDto, PagedResult, BookingListItemDto } from "@/lib/api/types"

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

type Scope = "upcoming" | "pending" | "past" | "cancelled"
const SCOPES: { id: Scope; label: string }[] = [
  { id: "upcoming", label: "Próximos" },
  { id: "pending", label: "Pendentes" },
  { id: "past", label: "Passados" },
  { id: "cancelled", label: "Cancelados" },
]

const EMPTY: Record<Scope, { icon: typeof Calendar; title: string; description: string }> = {
  upcoming: { icon: CalendarClock, title: "Nenhuma consulta futura por aqui", description: "Quando um paciente marcar um horário, a consulta aparece nesta lista. Compartilhe seu link publicando os tipos de consulta que você atende." },
  pending: { icon: CalendarClock, title: "Nada aguardando aprovação", description: "As consultas que precisam da sua confirmação aparecem aqui. Por enquanto, está tudo em dia." },
  past: { icon: CalendarCheck2, title: "Ainda sem consultas realizadas", description: "Seu histórico de atendimentos concluídos vai aparecer aqui conforme as consultas acontecem." },
  cancelled: { icon: CalendarX2, title: "Nenhuma consulta cancelada", description: "Consultas canceladas ou expiradas sem confirmação ficam registradas aqui." },
}

/**
 * Agendamentos do profissional — via API .NET. A aba, a busca e a página são resolvidas NO SERVIDOR
 * (`GET /bookings?scope=&q=&page=`), então a tela continua rápida com milhares de consultas.
 */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ scope?: string; page?: string; q?: string }> }) {
  await requireOnboarded()
  const sp = await searchParams
  const scope: Scope = SCOPES.some((s) => s.id === sp.scope) ? (sp.scope as Scope) : "upcoming"
  const q = (sp.q ?? "").trim()
  const pageNumber = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  const [result, summary] = await Promise.all([
    serverApiFetch<PagedResult<BookingListItemDto>>(endpoints.bookings.root, { query: { scope, page: pageNumber, ...(q ? { q } : {}) } })
      .catch(() => ({ items: [], total: 0, page: 1, pageSize: 20 }) as PagedResult<BookingListItemDto>),
    serverApiFetch<BookingSummaryDto>(endpoints.bookings.summary).catch(() => null),
  ])
  const counts: Record<Scope, number> = {
    upcoming: summary?.upcoming ?? 0, pending: summary?.pendingApproval ?? 0, past: summary?.past ?? 0, cancelled: summary?.cancelledOrExpired ?? 0,
  }

  const bookings: Row[] = result.items.map((b) => ({
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

  const getInitials = (name: string) =>
    name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()

  const renderRow = (b: Row, type: Scope) => {
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

  const empty = EMPTY[scope]
  const tabHref = (id: Scope) => `/dashboard/bookings?scope=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Meus agendamentos</h1>
          <p className="text-muted-foreground mt-1">Todas as suas consultas passadas e futuras.</p>
        </div>
      </div>

      <nav aria-label="Filtrar consultas" className="flex gap-1 rounded-xl bg-muted p-1 overflow-x-auto no-scrollbar w-full sm:w-fit">
        {SCOPES.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={t.id === scope ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${t.id === scope ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts[t.id]}</span>}
            {t.id === "pending" && counts.pending > 0 && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-warning animate-pulse align-middle" />}
          </Link>
        ))}
      </nav>

      <form method="get" action="/dashboard/bookings" role="search" className="mt-4 flex gap-2">
        <input type="hidden" name="scope" value={scope} />
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail do paciente" aria-label="Buscar consulta por paciente" className="max-w-sm rounded-xl" />
        <Button type="submit" variant="outline" className="rounded-xl">Buscar</Button>
        {q && <Button asChild variant="ghost" className="rounded-xl"><Link href={tabHref(scope).replace(/&q=[^&]*/, "")}>Limpar</Link></Button>}
      </form>

      <div className="mt-5 space-y-3">
        <Card className="rounded-2xl border-border/60 divide-y divide-border/60 shadow-sm overflow-hidden">
          {bookings.length === 0 ? (
            <EmptyState
              icon={empty.icon}
              title={q ? "Nenhuma consulta encontrada" : empty.title}
              description={q ? "Tente buscar por outro nome ou e-mail." : empty.description}
              action={scope === "upcoming" && !q ? (
                <Button asChild className="rounded-xl">
                  <Link href="/dashboard/event-types"><Plus size={16} /> Criar tipo de consulta</Link>
                </Button>
              ) : undefined}
            />
          ) : (
            bookings.map((b) => renderRow(b, scope))
          )}
        </Card>
        <ListPager basePath="/dashboard/bookings" params={{ scope, ...(q ? { q } : {}) }} page={result.page} pageSize={result.pageSize} total={result.total} noun="consultas" />
      </div>
    </div>
  )
}
