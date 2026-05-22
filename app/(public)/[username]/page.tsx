import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Clock, Globe, ArrowUpRight, MapPin, Video, Phone, Link as LinkIcon, Users } from "lucide-react"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import { Logo } from "@/components/ui/logo"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const getCachedUserMeta = async (username: string) => {
  return unstable_cache(
    async () => {
      return prisma.user.findUnique({
        where: { username },
        select: { name: true, bio: true },
      })
    },
    [`public-user-meta-${username}`],
    { tags: ["user-profile"], revalidate: 60 }
  )()
}

const getCachedUser = async (username: string) => {
  return unstable_cache(
    async () => {
      return prisma.user.findUnique({
        where: { username },
        select: {
          name: true, bio: true, image: true, theme: true, brandColor: true, timeZone: true,
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
    },
    [`public-user-profile-${username}`],
    { tags: ["user-profile"], revalidate: 60 }
  )()
}

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const user = await getCachedUserMeta(username)
  if (!user) return { title: "Não encontrado" }
  return {
    title: `Agendar com ${user.name}`,
    description: user.bio ?? undefined,
  }
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

  const user = await getCachedUser(username)

  if (!user) notFound()

  const userInitials = user.name?.[0]?.toUpperCase() ?? "U"

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/40 to-background dark:from-violet-950/20 dark:to-background">
      <header className="px-6 py-5 border-b border-border/60 bg-background/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Logo size={24} />
          </Link>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Powered by Marca AI
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Profile header */}
        <div className="flex flex-col items-center text-center">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? ""}
              className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-background"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg" style={{ fontSize: 32, fontWeight: 600 }}>
              {userInitials}
            </div>
          )}
          <h1 className="mt-5" style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
            {user.name}
          </h1>
          <p className="text-muted-foreground mt-1">marca-ai-app.vercel.app/{username}</p>
          {user.bio && (
            <p className="max-w-md mt-3 text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
              {user.bio}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe size={12} /> {user.timeZone || "Fuso horário não definido"}
          </div>
        </div>

        {/* Event list */}
        <div className="mt-12 space-y-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3" style={{ fontWeight: 600 }}>
            Selecione um tipo de evento
          </div>
          
          {user.eventTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center bg-muted/20">
              <Users className="mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="text-base font-medium">Nenhum serviço disponível</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O profissional ainda não cadastrou horários.
              </p>
            </div>
          ) : (
            user.eventTypes.map((et: any) => {
              const LocIcon = LOCATION_LABELS[et.locationType]?.icon ?? MapPin
              
              return (
                <Link key={et.id} href={`/${username}/${et.slug}`} className="block">
                  <Card
                    className="p-5 rounded-2xl border-border/60 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <LocIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{et.title}</h3>
                          <Badge variant="secondary" className="rounded-full text-xs font-normal">
                            <Clock size={11} className="mr-1" /> {et.duration} min
                          </Badge>
                          {et.price && (
                            <Badge className="rounded-full text-xs font-normal bg-primary text-primary-foreground">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(et.price / 100)}
                            </Badge>
                          )}
                        </div>
                        {et.description && (
                          <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2" style={{ lineHeight: 1.55 }}>
                            {et.description}
                          </p>
                        )}
                      </div>
                      <ArrowUpRight size={18} className="text-muted-foreground group-hover:text-primary transition shrink-0 mt-1" />
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