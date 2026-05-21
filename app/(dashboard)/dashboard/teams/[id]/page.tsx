import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { TeamMembersList } from "./components/team-members-list"
import { ArrowLeft, CreditCard, AlertCircle, QrCode } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detalhes da Equipe | MarcaAí" }

export default async function TeamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      subscription: true,
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } }
        },
        orderBy: { role: "asc" }
      }
    }
  })

  if (!team) redirect("/dashboard/teams")

  const currentMember = team.members.find((m: any) => m.userId === session.user.id)
  if (!currentMember) redirect("/dashboard/teams")

  const isSubscribed = team.subscription?.status === "active"

  return (
    <div className="space-y-8">
      {!isSubscribed && currentMember.role === "OWNER" && (
        <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-4 py-3 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <p className="text-sm font-medium text-amber-500">
              Assinatura pendente! Para que sua equipe possa receber agendamentos, ative o plano Pro.
            </p>
          </div>
          <Link
            href={`/dashboard/teams/${team.id}/billing`}
            className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/30 transition-colors"
          >
            Assinar Agora
          </Link>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link 
          href="/dashboard/teams"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-white">{team.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {team.slug} • Gerencie os membros e configurações da equipe.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <TeamMembersList 
            teamId={team.id} 
            members={team.members} 
            currentUserRole={currentMember.role}
            currentUserId={session.user.id}
          />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h3 className="text-base font-semibold text-white">Informações</h3>
            <div className="mt-4 space-y-4 text-sm text-zinc-400">
              <div>
                <p className="font-medium text-zinc-300">Link Público</p>
                <a href={`/team/${team.slug}`} target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">
                  marcaai.com/team/{team.slug}
                </a>
              </div>
              {currentMember.role === "OWNER" && (
                <>
                  <div>
                    <p className="font-medium text-zinc-300">Faturamento</p>
                    <Link href={`/dashboard/teams/${team.id}/billing`} className="text-violet-400 hover:underline flex items-center gap-1 mt-1">
                      <CreditCard className="h-4 w-4" />
                      Gerenciar Assinatura
                    </Link>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-300">Marketing (Mesa/Balcão)</p>
                    <Link href={`/dashboard/teams/${team.id}/marketing`} className="text-emerald-400 hover:underline flex items-center gap-1 mt-1">
                      <QrCode className="h-4 w-4" />
                      Imprimir QR Code
                    </Link>
                  </div>
                </>
              )}
              {team.description && (
                <div>
                  <p className="font-medium text-zinc-300">Descrição</p>
                  <p className="mt-1">{team.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
