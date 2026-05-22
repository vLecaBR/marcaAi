import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { TeamList } from "./components/team-list"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Equipes | People OS" }

export default async function TeamsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const myTeams = await prisma.team.findMany({
    where: {
      members: {
        some: { userId: session.user.id }
      }
    },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, image: true, email: true } } }
      },
      _count: { select: { eventTypes: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Equipes</h1>
        <p className="text-muted-foreground mt-1">
          Faça agendamentos junto com seus colegas de equipe.
        </p>
      </div>

      <TeamList teams={myTeams as any} currentUserId={session.user.id} />
    </div>
  )
}
