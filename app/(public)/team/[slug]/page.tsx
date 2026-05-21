import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Calendar, Users, MapPin, Clock } from "lucide-react"

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({
    where: { slug }
  })
  
  if (!team) return { title: "Equipe não encontrada" }

  return {
    title: `${team.name} | Agende seu horário`,
    description: team.description ?? `Agende online com a equipe ${team.name}`,
  }
}

export default async function PublicTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      members: {
        include: { user: { select: { name: true, image: true, username: true } } }
      },
      eventTypes: {
        where: { isActive: true },
        include: { user: { select: { username: true } } }
      }
    }
  })

  if (!team) notFound()

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-violet-600/20 text-3xl font-bold text-violet-400 ring-4 ring-zinc-950">
            <Users className="h-10 w-10" />
          </div>
          
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {team.name}
          </h1>
          {team.description && (
            <p className="mt-3 text-sm text-zinc-400 max-w-lg mx-auto">
              {team.description}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {team.members.map((member: any) => (
              <Link 
                key={member.id} 
                href={`/${member.user.username}`}
                className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 transition-colors hover:bg-zinc-800 hover:text-white text-zinc-400 text-xs font-medium"
              >
                {member.user.image ? (
                  <img src={member.user.image} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px]">
                    {member.user.name?.[0] ?? "U"}
                  </span>
                )}
                {member.user.name}
              </Link>
            ))}
          </div>
        </div>

        {team.eventTypes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {team.eventTypes.map((et: any) => (
              <Link
                key={et.id}
                href={`/${et.user.username}/${et.slug}`}
                className="group flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-medium text-white">{et.title}</h2>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${COLOR_MAP[et.color]}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                </div>
                
                {et.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-zinc-400">
                    {et.description}
                  </p>
                )}
                
                <div className="mt-auto pt-6 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5 font-medium">
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
          <div className="rounded-2xl border border-zinc-800 border-dashed bg-zinc-900/20 py-16 text-center">
            <h3 className="text-sm font-medium text-white">Nenhum serviço disponível</h3>
            <p className="mt-1 text-sm text-zinc-500">Esta equipe ainda não configurou nenhum tipo de evento coletivo.</p>
          </div>
        )}

        <div className="mt-16 border-t border-zinc-800/60 pt-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <Calendar className="h-3 w-3 text-white" />
            </div>
            Powered by MarcaAí
          </Link>
        </div>
      </div>
    </div>
  )
}
