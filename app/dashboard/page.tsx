import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard" }

const COLOR_MAP: Record<string, string> = {
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

const COLOR_BG_MAP: Record<string, string> = {
  SLATE:   "bg-slate-500/10 border-slate-500/20",
  ROSE:    "bg-rose-500/10 border-rose-500/20",
  ORANGE:  "bg-orange-500/10 border-orange-500/20",
  AMBER:   "bg-amber-500/10 border-amber-500/20",
  EMERALD: "bg-emerald-500/10 border-emerald-500/20",
  TEAL:    "bg-teal-500/10 border-teal-500/20",
  CYAN:    "bg-cyan-500/10 border-cyan-500/20",
  VIOLET:  "bg-violet-500/10 border-violet-500/20",
  FUCHSIA: "bg-fuchsia-500/10 border-fuchsia-500/20",
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [eventTypes, bookingStats, upcomingBookings] = await Promise.all([
    // Event types com contagem de bookings
    prisma.eventType.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        duration: true,
        color: true,
        isActive: true,
        locationType: true,
        _count: { select: { bookings: true } },
      },
    }),

    // Stats gerais de bookings
    prisma.booking.groupBy({
      by: ["status"],
      where: { userId: session.user.id },
      _count: { _all: true },
    }),

    // Próximos agendamentos
    prisma.booking.findMany({
      where: {
        userId: session.user.id,
        status: { in: ["CONFIRMED", "PENDING"] },
        startTime: { gte: new Date() },
      },
      orderBy: { startTime: "asc" },
      take: 5,
      select: {
        id: true,
        uid: true,
        guestName: true,
        guestEmail: true,
        startTime: true,
        endTime: true,
        status: true,
        eventType: {
          select: { title: true, color: true, duration: true },
        },
      },
    }),
  ])

  // Monta stats
  const totalBookings = bookingStats.reduce((acc, s) => acc + s._count._all, 0)
  const confirmedCount = bookingStats.find((s) => s.status === "CONFIRMED")?._count._all ?? 0
  const pendingCount   = bookingStats.find((s) => s.status === "PENDING")?._count._all ?? 0
  const cancelledCount = bookingStats.find((s) => s.status === "CANCELLED")?._count._all ?? 0

  const firstName = session.user.name?.split(" ")[0] ?? "Usuário"
  const username  = session.user.username

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-8 sm:space-y-10 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Olá, {firstName} 👋
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Aqui está o resumo da sua agenda.
          </p>
        </div>

        {username && (
          <a
            href={`/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-zinc-900/50 px-4 py-2.5",
              "text-sm font-medium text-zinc-300 ring-1 ring-inset ring-zinc-800",
              "transition-all hover:bg-zinc-800 hover:text-white"
            )}
          >
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Minha página pública
          </a>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total de agendamentos"
          value={totalBookings}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
          accent="zinc"
        />
        <StatCard
          label="Confirmados"
          value={confirmedCount}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          accent="emerald"
        />
        <StatCard
          label="Pendentes"
          value={pendingCount}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          accent="amber"
        />
        <StatCard
          label="Cancelados"
          value={cancelledCount}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          accent="rose"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Event Types */}
        <div className="lg:col-span-3 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">
              Seus tipos de evento
            </h2>
            <Link
              href="/dashboard/event-types"
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              Ver todos <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          {eventTypes.length === 0 ? (
            <EmptyEventTypes />
          ) : (
            <div className="space-y-3">
              {eventTypes.map((et) => (
                <div
                  key={et.id}
                  className={cn(
                    "group flex items-center gap-3 sm:gap-4 rounded-xl border p-3 sm:p-4 transition-all",
                    et.isActive
                      ? "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                      : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
                  )}
                >
                  {/* Color dot */}
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      COLOR_BG_MAP[et.color]
                    )}
                  >
                    <span className={cn("h-3 w-3 rounded-full", COLOR_MAP[et.color])} />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {et.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {et.duration} min · {et._count.bookings} agendamento{et._count.bookings !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Status + Link */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {!et.isActive && (
                      <span className="hidden sm:inline-flex rounded-md bg-zinc-800/80 px-2 py-1 text-xs font-medium text-zinc-400">
                        Inativo
                      </span>
                    )}
                    {username && (
                      <a
                        href={`/${username}/${et.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximos agendamentos */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">
              Próximos agendamentos
            </h2>
            <Link
              href="/dashboard/bookings"
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              Ver todos <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
            <EmptyBookings />
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 space-y-3 transition-colors hover:bg-zinc-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {booking.guestName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {booking.eventType.title}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        booking.status === "CONFIRMED"
                          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                      )}
                    >
                      {booking.status === "CONFIRMED" ? "Confirmado" : "Pendente"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {booking.startTime.toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    }).replace('.', '')}{" "}
                    às{" "}
                    {booking.startTime.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

const ACCENT_MAP = {
  zinc:    { card: "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80", icon: "bg-zinc-800 text-zinc-400" },
  emerald: { card: "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80", icon: "bg-emerald-500/10 text-emerald-500" },
  amber:   { card: "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80", icon: "bg-amber-500/10 text-amber-500" },
  rose:    { card: "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80", icon: "bg-rose-500/10 text-rose-500" },
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: keyof typeof ACCENT_MAP
}) {
  const style = ACCENT_MAP[accent]
  return (
    <div className={cn("relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 sm:p-6 transition-colors", style.card)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-zinc-400 leading-snug">{label}</p>
        <div className={cn("flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl", style.icon)}>
          {icon}
        </div>
      </div>
      <div className="mt-4 sm:mt-6">
        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{value}</p>
      </div>
    </div>
  )
}

function EmptyEventTypes() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-10 sm:px-6 sm:py-16 text-center">
      <div className="mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-zinc-800/80 ring-8 ring-zinc-900">
        <svg className="h-5 w-5 sm:h-6 sm:w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white">Nenhum tipo de evento</h3>
      <p className="mt-1.5 text-xs sm:text-sm text-zinc-500">Crie seu primeiro evento para receber agendamentos.</p>
      <Link
        href="/dashboard/event-types"
        className="mt-6 w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        Criar meu primeiro evento
      </Link>
    </div>
  )
}

function EmptyBookings() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-10 sm:px-6 sm:py-16 text-center">
      <div className="mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-zinc-800/80 ring-8 ring-zinc-900">
        <svg className="h-5 w-5 sm:h-6 sm:w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-white">Nenhum agendamento próximo</h3>
      <p className="mt-1.5 text-xs sm:text-sm text-zinc-500">Sua agenda está livre por enquanto.</p>
    </div>
  )
}