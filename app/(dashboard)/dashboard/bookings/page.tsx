import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { CalendarDays, Clock, Users, Link as LinkIcon } from "lucide-react"
import { BookingActions } from "./components/booking-actions"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Agendamentos | MarcaAí" }

const COLOR_MAP: Record<string, string> = {
  SLATE: "bg-slate-500", ROSE: "bg-rose-500", ORANGE: "bg-orange-500",
  AMBER: "bg-amber-500", EMERALD: "bg-emerald-500", TEAL: "bg-teal-500",
  CYAN: "bg-cyan-500", VIOLET: "bg-violet-500", FUCHSIA: "bg-fuchsia-500",
}

export default async function BookingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "desc" },
    include: {
      eventType: {
        select: { title: true, color: true, locationType: true },
      },
    },
  })

  // Separa os bookings
  const pending = bookings.filter(b => b.status === "PENDING" && b.startTime > new Date())
  const upcoming = bookings.filter(b => b.status === "CONFIRMED" && b.startTime > new Date())
  const past = bookings.filter(b => b.startTime <= new Date() || b.status === "CANCELLED")

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Agendamentos
          </h1>
          <p className="mt-2 text-zinc-400">
            Visualize e gerencie seus horários marcados.
          </p>
        </div>
      </div>

      <div className="space-y-10">
        {/* PENDENTES (Aprovação Manual) */}
        {pending.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Aguardando Aprovação ({pending.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pending.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          </section>
        )}

        {/* PRÓXIMOS */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Próximos Confirmados</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 py-16 text-center">
              <CalendarDays className="mx-auto mb-4 h-8 w-8 text-zinc-700" />
              <p className="text-sm font-medium text-white">Nenhum agendamento futuro</p>
              <p className="mt-1 text-xs text-zinc-500">Sua agenda está livre por enquanto.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </section>

        {/* HISTÓRICO */}
        {past.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Histórico e Cancelados</h2>
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 divide-y divide-zinc-800/60">
              {past.slice(0, 10).map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-zinc-950 border border-zinc-800 opacity-60">
                      <span className="text-xs font-medium text-zinc-500">
                        {format(booking.startTime, "MMM", { locale: ptBR }).toUpperCase()}
                      </span>
                      <span className="text-lg font-bold text-white">
                        {format(booking.startTime, "dd")}
                      </span>
                    </div>
                    <div>
                      <p className={cn("font-medium text-white", booking.status === "CANCELLED" && "line-through text-zinc-500")}>
                        {booking.guestName}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        {booking.eventType.title} • {format(booking.startTime, "HH:mm")}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide",
                      booking.status === "CONFIRMED" ? "bg-zinc-800 text-zinc-400" :
                      booking.status === "CANCELLED" ? "bg-rose-500/10 text-rose-400" :
                      "bg-zinc-800 text-zinc-500"
                    )}>
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function BookingCard({ booking }: { booking: {
  id: string
  uid: string
  guestName: string
  guestEmail: string
  startTime: Date
  endTime: Date
  status: string
  eventType: {
    title: string
    color: string
    locationType: string
  }
} }) {
  const isPending = booking.status === "PENDING"

  return (
    <div className={cn(
      "flex flex-col rounded-2xl border bg-zinc-900/40 p-5 transition-all",
      isPending ? "border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.1)]" : "border-zinc-800/60 hover:border-zinc-700/80"
    )}>
      {/* Header do Card */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-col items-center justify-center rounded-lg bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] font-medium text-zinc-500">
              {format(booking.startTime, "MMM", { locale: ptBR }).toUpperCase()}
            </span>
            <span className="text-sm font-bold text-white">
              {format(booking.startTime, "dd")}
            </span>
          </div>
          <div>
            <p className="font-semibold text-white truncate max-w-[150px]" title={booking.guestName}>
              {booking.guestName}
            </p>
            <p className="text-xs text-zinc-500 truncate max-w-[150px]" title={booking.guestEmail}>
              {booking.guestEmail}
            </p>
          </div>
        </div>
      </div>

      {/* Detalhes (Serviço / Hora) */}
      <div className="space-y-2.5 mb-5 flex-1">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <div className={cn("h-2 w-2 rounded-full shrink-0", COLOR_MAP[booking.eventType.color])} />
          <span className="truncate">{booking.eventType.title}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            {format(booking.startTime, "HH:mm")} - {format(booking.endTime, "HH:mm")}
          </span>
        </div>
      </div>

      {/* Ações / Status Base */}
      <div className="mt-auto pt-4 border-t border-zinc-800/60">
        {isPending ? (
          <BookingActions uid={booking.uid} status={booking.status} />
        ) : (
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-400">
              Confirmado
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
