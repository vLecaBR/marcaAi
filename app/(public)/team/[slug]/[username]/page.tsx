import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Calendar, Users, MapPin, Clock, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

// Em vez de usar cn() externo, defino as classes baseadas num mapa
const COLOR_MAP: Record<string, string> = {
  SLATE: "border-slate-500/20 bg-slate-500/10 text-slate-400 group-hover:bg-slate-500/20 group-hover:border-slate-500/30",
  ROSE: "border-rose-500/20 bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 group-hover:border-rose-500/30",
  ORANGE: "border-orange-500/20 bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20 group-hover:border-orange-500/30",
  AMBER: "border-amber-500/20 bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 group-hover:border-amber-500/30",
  EMERALD: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30",
  TEAL: "border-teal-500/20 bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 group-hover:border-teal-500/30",
  CYAN: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/30",
  VIOLET: "border-violet-500/20 bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 group-hover:border-violet-500/30",
  FUCHSIA: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-400 group-hover:bg-fuchsia-500/20 group-hover:border-fuchsia-500/30",
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet", ZOOM: "Zoom", TEAMS: "Teams",
  PHONE: "Telefone", IN_PERSON: "Presencial", CUSTOM: "Local remoto",
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; username: string }> }) {
  const { slug, username } = await params
  const teamMember = await prisma.teamMember.findFirst({
    where: { 
      team: { slug },
      user: { username }
    },
    include: {
      team: true,
      user: true
    }
  })
  
  if (!teamMember) return { title: "Membro não encontrado" }

  return {
    title: `${teamMember.user.name} | ${teamMember.team.name}`,
    description: `Agende online com ${teamMember.user.name} em ${teamMember.team.name}`,
  }
}

export default async function PublicTeamMemberPage({ params }: { params: Promise<{ slug: string; username: string }> }) {
  const { slug, username } = await params

  const teamMember = await prisma.teamMember.findFirst({
    where: { 
      team: { slug },
      user: { username }
    },
    include: {
      team: {
        select: { name: true, slug: true, theme: true, brandColor: true }
      },
      user: {
        select: { id: true, name: true, image: true, username: true, bio: true }
      }
    }
  }) as any

  if (!teamMember) notFound()

  // Buscar os tipos de evento DESSA equipe QUE PERTENCEM a ESSE usuario
  const eventTypes = await prisma.eventType.findMany({
    where: { 
      teamId: teamMember.teamId,
      userId: teamMember.userId,
      isActive: true
    },
  })

  return (
    <div 
      className={cn(
        "flex min-h-screen flex-col items-center px-4 py-16 sm:px-6",
        teamMember.team.theme === "LIGHT" ? "bg-slate-50 text-slate-900" : "bg-[#09090b] text-white"
      )}
      style={{
        "--brand": teamMember.team.brandColor ?? "#7c3aed",
      } as React.CSSProperties}
    >
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex">
          <Link 
            href={`/team/${teamMember.team.slug}`}
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-colors",
              teamMember.team.theme === "LIGHT" ? "text-slate-500 hover:text-slate-900" : "text-zinc-500 hover:text-white"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para {teamMember.team.name}
          </Link>
        </div>

        <div className="mb-10 text-center">
          <div className={cn(
            "mx-auto mb-5 h-20 w-20 overflow-hidden rounded-full ring-4",
            teamMember.team.theme === "LIGHT" ? "bg-slate-200 ring-slate-100" : "bg-zinc-800 ring-zinc-950"
          )}>
            {teamMember.user.image ? (
              <img src={teamMember.user.image} alt={teamMember.user.name ?? ""} className="h-full w-full object-cover" />
            ) : (
              <div className={cn(
                "flex h-full w-full items-center justify-center text-3xl font-bold",
                teamMember.team.theme === "LIGHT" ? "text-slate-400" : "text-zinc-400"
              )}>
                {teamMember.user.name?.[0] ?? "U"}
              </div>
            )}
          </div>
          
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {teamMember.user.name}
          </h1>
          {teamMember.user.bio && (
            <p className={cn(
              "mt-3 text-sm max-w-lg mx-auto",
              teamMember.team.theme === "LIGHT" ? "text-slate-600" : "text-zinc-400"
            )}>
              {teamMember.user.bio}
            </p>
          )}
          <p className={cn(
            "mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium",
            teamMember.team.theme === "LIGHT" ? "bg-slate-200 text-slate-600" : "bg-zinc-900 text-zinc-400"
          )}>
            Membro da equipe <span className={teamMember.team.theme === "LIGHT" ? "text-slate-900" : "text-white"}>{teamMember.team.name}</span>
          </p>
        </div>

        {eventTypes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {eventTypes.map((et: any) => (
              <Link
                key={et.id}
                href={`/${teamMember.user.username}/${et.slug}`}
                className={cn(
                  "group flex flex-col rounded-2xl border p-5 transition-all",
                  teamMember.team.theme === "LIGHT"
                    ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-medium" style={{ color: "inherit" }}>{et.title}</h2>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${COLOR_MAP[et.color]}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                </div>
                
                {et.description && (
                  <p className={cn(
                    "mt-3 line-clamp-2 text-sm",
                    teamMember.team.theme === "LIGHT" ? "text-slate-500" : "text-zinc-400"
                  )}>
                    {et.description}
                  </p>
                )}
                
                <div className={cn(
                  "mt-auto pt-6 flex flex-wrap items-center gap-3 text-xs font-medium",
                  teamMember.team.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"
                )}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {et.duration} min
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {LOCATION_LABELS[et.locationType] ?? et.locationType}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={cn(
            "rounded-2xl border border-dashed py-16 text-center",
            teamMember.team.theme === "LIGHT" ? "border-slate-300 bg-slate-100" : "border-zinc-800 bg-zinc-900/20"
          )}>
            <h3 className="text-sm font-medium">Nenhum serviço disponível</h3>
            <p className={cn(
              "mt-1 text-sm",
              teamMember.team.theme === "LIGHT" ? "text-slate-500" : "text-zinc-500"
            )}>
              {teamMember.user.name} ainda não configurou nenhum tipo de evento coletivo.
            </p>
          </div>
        )}

        <div className={cn(
          "mt-16 border-t pt-8 text-center",
          teamMember.team.theme === "LIGHT" ? "border-slate-200" : "border-zinc-800/60"
        )}>
          <Link href="/" className={cn(
            "inline-flex items-center gap-2 text-xs font-medium transition-colors",
            teamMember.team.theme === "LIGHT" ? "text-slate-500 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"
          )}>
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-fuchsia-600" style={{ backgroundColor: "var(--brand)" }}>
              <Calendar className="h-3 w-3 text-white" />
            </div>
            Powered by MarcaAí
          </Link>
        </div>
      </div>
    </div>
  )
}