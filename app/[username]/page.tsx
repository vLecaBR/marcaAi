import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, bio: true },
  })
  if (!user) return { title: "Não encontrado" }
  return {
    title: `Agendar com ${user.name}`,
    description: user.bio ?? undefined,
  }
}

const COLOR_MAP: Record<string, string> = {
  SLATE: "bg-slate-500", ROSE: "bg-rose-500", ORANGE: "bg-orange-500",
  AMBER: "bg-amber-500", EMERALD: "bg-emerald-500", TEAL: "bg-teal-500",
  CYAN: "bg-cyan-500", VIOLET: "bg-violet-500", FUCHSIA: "bg-fuchsia-500",
}

const COLOR_BORDER_MAP: Record<string, string> = {
  SLATE: "border-slate-500/30 hover:border-slate-500/60",
  ROSE: "border-rose-500/30 hover:border-rose-500/60",
  ORANGE: "border-orange-500/30 hover:border-orange-500/60",
  AMBER: "border-amber-500/30 hover:border-amber-500/60",
  EMERALD: "border-emerald-500/30 hover:border-emerald-500/60",
  TEAL: "border-teal-500/30 hover:border-teal-500/60",
  CYAN: "border-cyan-500/30 hover:border-cyan-500/60",
  VIOLET: "border-violet-500/30 hover:border-violet-500/60",
  FUCHSIA: "border-fuchsia-500/30 hover:border-fuchsia-500/60",
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet", ZOOM: "Zoom", TEAMS: "Teams",
  PHONE: "Telefone", IN_PERSON: "Presencial", CUSTOM: "Online",
}

export default async function UserPublicPage({ params }: Props) {
  const { username } = await params

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      name: true, bio: true, image: true,
      eventTypes: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, title: true, slug: true,
          description: true, duration: true,
          color: true, locationType: true,
        },
      },
    },
  })

  if (!user) notFound()

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-16">
      <div className="mx-auto max-w-xl">
        {/* Owner info */}
        <div className="mb-10 text-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? ""}
              className="mx-auto mb-4 h-20 w-20 rounded-full ring-2 ring-zinc-800"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-violet-600/20 text-2xl font-semibold text-violet-400">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <h1 className="text-xl font-semibold text-white">{user.name}</h1>
          {user.bio && (
            <p className="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
              {user.bio}
            </p>
          )}
        </div>

        {/* Event types */}
        {user.eventTypes.length === 0 ? (
          <p className="text-center text-sm text-zinc-600">
            Nenhum tipo de evento disponível no momento.
          </p>
        ) : (
          <div className="space-y-3">
            {user.eventTypes.map((et) => (
              <Link
                key={et.id}
                href={`/${username}/${et.slug}`}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border bg-zinc-900/60 p-5",
                  "transition-all hover:bg-zinc-900",
                  COLOR_BORDER_MAP[et.color]
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
                  <span className={cn("h-3 w-3 rounded-full", COLOR_MAP[et.color])} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{et.title}</p>
                  {et.description && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {et.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-zinc-300">
                    {et.duration} min
                  </p>
                  <p className="text-xs text-zinc-600">
                    {LOCATION_LABELS[et.locationType]}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-12 text-center text-xs text-zinc-700">
          Agendamento via{" "}
          <span className="text-zinc-500 font-medium">People OS</span>
        </p>
      </div>
    </main>
  )
}