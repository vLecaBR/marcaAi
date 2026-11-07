import { notFound } from "next/navigation"
import Link from "next/link"
import { Clock, Globe, ArrowUpRight, MapPin, Video, Phone, Link as LinkIcon, Users } from "lucide-react"
import type { Metadata } from "next"
import { Logo } from "@/components/ui/logo"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import { safeBrandColor } from "@/lib/brand-theme"
import type { PublicProfileWithEventsDto } from "@/lib/api/booking-types"
import { PUBLIC_HOST } from "@/lib/site"

interface Props {
  params: Promise<{ username: string }>
}

async function getProfile(username: string): Promise<PublicProfileWithEventsDto | null> {
  try {
    return await serverApiFetch<PublicProfileWithEventsDto>(endpoints.public(username))
  } catch (err) {
    // Perfil inexistente (404) ou backend inacessível/instável (network/server) → tratamos como
    // "não encontrado" para exibir a página de 404 amigável em vez de estourar 500.
    if (isApiError(err) && (err.kind === "not_found" || err.kind === "network" || err.kind === "server")) {
      return null
    }
    throw err
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfile(username)
  if (!profile) return { title: "Não encontrado" }
  return { title: `Agendar com ${profile.name ?? username}`, description: profile.bio ?? undefined }
}

const LOCATION_ICONS: Record<string, React.ElementType> = {
  GOOGLE_MEET: Video, ZOOM: Video, TEAMS: Video, PHONE: Phone, IN_PERSON: MapPin, CUSTOM: LinkIcon,
}

/**
 * Página pública do profissional — 100% via API .NET (`GET /public/{username}`).
 * Marca temável com contraste AA garantido (ADR-0004): a cor do profissional só entra se passar
 * no teste; senão, o Teal institucional assume. Aplicada via a CSS var `--brand`.
 */
export default async function UserPublicPage({ params }: Props) {
  const { username } = await params
  const profile = await getProfile(username)
  if (!profile) notFound()

  const brand = safeBrandColor(profile.brandColor)
  const initials = profile.name?.[0]?.toUpperCase() ?? "U"

  return (
    <div className="min-h-screen bg-surface" style={{ "--brand": brand } as React.CSSProperties}>
      <header className="px-6 py-5 border-b border-border/60 bg-background/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/"><Logo size={24} /></Link>
          <span className="text-xs text-muted-foreground">Powered by MarcaAí</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center text-center">
          {profile.image ? (
            <img
              src={profile.image}
              alt={profile.name ?? ""}
              className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-background"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg"
              style={{ background: "var(--brand)", fontSize: 32, fontWeight: 600 }}
            >
              {initials}
            </div>
          )}
          <h1 className="mt-5" style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
            {profile.name}
          </h1>
          <p className="text-muted-foreground mt-1">{PUBLIC_HOST}/{username}</p>
          {profile.bio && (
            <p className="max-w-md mt-3 text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
              {profile.bio}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe size={12} /> {profile.timeZone || "Fuso não definido"}
          </div>
        </div>

        <div className="mt-12 space-y-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3" style={{ fontWeight: 600 }}>
            Escolha o tipo de consulta
          </div>

          {profile.eventTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center bg-muted/20">
              <Users className="mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="text-base font-medium">Nenhum serviço disponível</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O profissional ainda não cadastrou horários.
              </p>
            </div>
          ) : (
            profile.eventTypes.map((et) => {
              const LocIcon = LOCATION_ICONS[et.locationType] ?? MapPin
              return (
                <Link key={et.id} href={`/${username}/${et.slug}`} className="block">
                  <Card className="p-5 rounded-2xl border-border/60 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group active:scale-[0.99]">
                    <div className="flex items-start gap-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{ background: "var(--brand)" }}
                      >
                        <LocIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{et.title}</h3>
                          <Badge variant="secondary" className="rounded-full text-xs font-normal">
                            <Clock size={11} className="mr-1" /> {et.duration} min
                          </Badge>
                          {et.price ? (
                            <Badge
                              className="rounded-full text-xs font-normal text-white border-0"
                              style={{ background: "var(--brand)" }}
                            >
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(et.price / 100)}
                            </Badge>
                          ) : null}
                        </div>
                        {et.description && (
                          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2" style={{ lineHeight: 1.55 }}>
                            {et.description}
                          </p>
                        )}
                      </div>
                      <ArrowUpRight size={18} className="text-muted-foreground group-hover:text-foreground transition shrink-0 mt-1" />
                    </div>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
