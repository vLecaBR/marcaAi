import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Clock, MapPin, Video, Phone, Link as LinkIcon, Users, CalendarDays, ArrowRight } from "lucide-react"
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

const LOCATION_LABELS: Record<string, { label: string, icon: React.ElementType }> = {
  GOOGLE_MEET: { label: "Google Meet", icon: Video },
  ZOOM: { label: "Zoom", icon: Video },
  TEAMS: { label: "Teams", icon: Video },
  PHONE: { label: "Telefone", icon: Phone },
  IN_PERSON: { label: "Presencial", icon: MapPin },
  CUSTOM: { label: "Online", icon: LinkIcon },
}

export default async function UserPublicPage({ params }: Props) {
  const { username } = await params

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      name: true, bio: true, image: true, theme: true, brandColor: true,
      eventTypes: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, title: true, slug: true,
          description: true, duration: true,
          color: true, locationType: true,
          price: true,
        },
      },
    },
  })

  if (!user) notFound()

  return (
    <main 
      className={cn(
        "min-h-screen",
        user.theme === "LIGHT" ? "bg-slate-50 text-slate-900" : "bg-[#09090b] text-white"
      )}
      style={{
        "--brand": user.brandColor ?? "#7c3aed",
      } as React.CSSProperties}
    >
      {/* Header com Cover */}
      <div className={cn(
        "relative h-48 w-full sm:h-64 overflow-hidden",
        user.theme === "LIGHT" ? "bg-slate-200" : "bg-zinc-900"
      )}>
        <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundColor: "var(--brand)" }} />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay" />
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Perfil (Avatar subindo sobre o cover) */}
        <div className="relative -mt-16 sm:-mt-20 mb-8 flex flex-col items-center sm:items-start">
          <div className={cn(
            "rounded-full p-1.5 shadow-xl",
            user.theme === "LIGHT" ? "bg-slate-50" : "bg-[#09090b]"
          )}>
            {user.image ? (
              <img
                src={user.image}
                alt={user.name ?? ""}
                className={cn(
                  "h-28 w-28 sm:h-32 sm:w-32 rounded-full object-cover ring-1",
                  user.theme === "LIGHT" ? "ring-slate-200" : "ring-zinc-800"
                )}
              />
            ) : (
              <div className={cn(
                "flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full text-4xl font-semibold ring-1",
                user.theme === "LIGHT" ? "bg-slate-200 text-slate-500 ring-slate-300" : "bg-zinc-800 text-zinc-400 ring-zinc-700"
              )}>
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
          </div>

          <div className="mt-4 text-center sm:text-left w-full">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {user.name}
            </h1>
            <div className={cn(
              "mt-1 flex items-center justify-center sm:justify-start gap-2 text-sm",
              user.theme === "LIGHT" ? "text-slate-500" : "text-zinc-400"
            )}>
              <LinkIcon className="h-4 w-4" />
              <span>marcaai.com/{username}</span>
            </div>
            {user.bio && (
              <p className={cn(
                "mt-4 max-w-lg text-sm leading-relaxed mx-auto sm:mx-0",
                user.theme === "LIGHT" ? "text-slate-600" : "text-zinc-300"
              )}>
                {user.bio}
              </p>
            )}
          </div>
        </div>

        <div className={cn(
          "h-px w-full my-8",
          user.theme === "LIGHT" ? "bg-slate-200" : "bg-zinc-800/60"
        )} />

        {/* Seção de Serviços */}
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="h-5 w-5" style={{ color: "var(--brand)" }} />
          <h2>Serviços Disponíveis</h2>
        </div>

        {user.eventTypes.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center",
            user.theme === "LIGHT" ? "border-slate-300 bg-slate-100" : "border-zinc-800 bg-zinc-900/20"
          )}>
            <Users className={cn(
              "mb-4 h-10 w-10",
              user.theme === "LIGHT" ? "text-slate-400" : "text-zinc-700"
            )} />
            <h3 className="text-base font-medium">Nenhum serviço disponível</h3>
            <p className={cn(
              "mt-1 text-sm",
              user.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"
            )}>
              O profissional ainda não cadastrou horários.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 pb-20">
            {user.eventTypes.map((et: any) => {
              const LocIcon = LOCATION_LABELS[et.locationType]?.icon ?? MapPin
              const locLabel = LOCATION_LABELS[et.locationType]?.label ?? "Local"

              return (
                <Link
                  key={et.id}
                  href={`/${username}/${et.slug}`}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border p-5 transition-all",
                    user.theme === "LIGHT" 
                      ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md" 
                      : "border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/80 hover:border-zinc-700"
                  )}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className={cn("h-3 w-3 shrink-0 rounded-full", COLOR_MAP[et.color])} />
                    <h3 className="font-semibold transition-colors" style={{ color: "inherit" }}>
                      {et.title}
                    </h3>
                  </div>

                  {et.description && (
                    <p className={cn(
                      "mb-6 line-clamp-2 text-sm flex-1",
                      user.theme === "LIGHT" ? "text-slate-500" : "text-zinc-400"
                    )}>
                      {et.description}
                    </p>
                  )}

                  <div className={cn(
                    "mt-auto flex flex-wrap items-center gap-y-2 gap-x-4 text-xs font-medium",
                    user.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"
                  )}>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                      user.theme === "LIGHT" ? "bg-slate-100" : "bg-zinc-950/50"
                    )}>
                      <Clock className="h-3.5 w-3.5" />
                      <span>{et.duration} min</span>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md",
                      user.theme === "LIGHT" ? "bg-slate-100" : "bg-zinc-950/50"
                    )}>
                      <LocIcon className="h-3.5 w-3.5" />
                      <span>{locLabel}</span>
                    </div>
                    {et.price && (
                      <div 
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md ml-auto"
                        style={{ backgroundColor: "var(--brand)", color: "#fff" }}
                      >
                        <span>
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(et.price / 100)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Seta de hover */}
                  <div className="absolute right-5 bottom-5 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                    <ArrowRight className="h-5 w-5" style={{ color: "var(--brand)" }} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <footer className={cn(
        "fixed bottom-0 w-full border-t p-4 backdrop-blur-md text-center",
        user.theme === "LIGHT" ? "border-slate-200 bg-white/90 text-slate-500" : "border-zinc-800/60 bg-[#09090b]/90 text-zinc-500"
      )}>
        <p className="text-xs">
          Agendamentos fornecidos por{" "}
          <Link href="/" className="font-medium hover:opacity-80 transition-opacity" style={{ color: "var(--brand)" }}>
            MarcaAí
          </Link>
        </p>
      </footer>
    </main>
  )
}