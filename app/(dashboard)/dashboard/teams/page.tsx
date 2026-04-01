import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { TeamList } from "./components/team-list"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Equipes | MarcaAí" }

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
        include: { user: { select: { name: true, image: true, email: true } } }
      },
      _count: { select: { eventTypes: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Equipes</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Crie organizações e convide outros profissionais para agendas compartilhadas.
        </p>
      </div>

      <TeamList teams={myTeams} currentUserId={session.user.id} />
    </div>
  )
}
