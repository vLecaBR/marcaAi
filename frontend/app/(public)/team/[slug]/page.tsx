import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Building2, ChevronRight, UserRound } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { rawApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { PublicTeamDto } from "@/lib/api/booking-types"

export const dynamic = "force-dynamic"

async function getTeam(slug: string): Promise<PublicTeamDto | null> {
  try {
    const res = await rawApiFetch<PublicTeamDto>(endpoints.publicTeam(slug))
    return res.data
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") return null
    throw err
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const team = await getTeam(slug)
  return { title: team ? team.name : "Clínica" }
}

/** Página pública da clínica: apresentação + profissionais (cada um leva ao seu agendamento). */
export default async function TeamPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const team = await getTeam(slug)
  if (!team) notFound()

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="px-6 py-5 border-b border-border/60">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/"><Logo size={24} /></Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4">
            {team.logo ? (
              <img src={team.logo} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-brand-primary">
                <Building2 size={26} />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
              {team.description && <p className="mt-1 text-sm text-muted-foreground">{team.description}</p>}
            </div>
          </div>

          <h2 className="mt-10 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Profissionais
          </h2>

          {team.professionals.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Esta clínica ainda não tem profissionais com agenda pública.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {team.professionals.map((p) => (
                <li key={p.username}>
                  <Link
                    href={`/${p.username}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 transition hover:border-brand-primary/50 hover:shadow-sm"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-brand-primary">
                        <UserRound size={20} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name ?? p.username}</p>
                      {(p.specialty || p.council) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[p.specialty, p.council].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
