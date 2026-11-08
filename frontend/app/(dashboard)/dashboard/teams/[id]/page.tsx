import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CreditCard, AlertCircle, QrCode } from "lucide-react"
import { TeamMembersList } from "./components/team-members-list"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { TeamDetailDto, TeamBillingDto } from "@/lib/api/types"
import { PUBLIC_HOST } from "@/lib/site"

export const metadata: Metadata = { title: "Detalhes da clínica" }

/**
 * Detalhe da clínica — via API .NET (`GET /teams/{id}` + `GET /teams/{id}/billing`).
 * O backend enforça o RBAC: 403/404 → notFound (não vaza a existência da clínica).
 */
export default async function TeamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOnboarded()
  const { id } = await params

  let team: TeamDetailDto
  try {
    team = await serverApiFetch<TeamDetailDto>(endpoints.teams.byId(id))
  } catch (err) {
    if (isApiError(err) && (err.kind === "not_found" || err.kind === "forbidden")) notFound()
    if (isApiError(err) && err.kind === "unauthorized") redirect("/login")
    throw err
  }

  const billing = await serverApiFetch<TeamBillingDto>(endpoints.teams.billing(id)).catch(() => null)
  const isSubscribed = billing?.active ?? false
  const currentUserRole = team.role

  const members = team.members.map((m) => ({
    id: m.userId,
    userId: m.userId,
    role: m.role,
    user: { id: m.userId, name: m.name, email: m.email, image: null as string | null },
  }))

  return (
    <div className="space-y-8">
      {!isSubscribed && currentUserRole === "OWNER" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-warning/10 px-4 py-3 border border-warning/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-warning" />
            <p className="text-sm font-medium text-warning-foreground">
              Assinatura pendente. Ative o plano para a clínica receber agendamentos.
            </p>
          </div>
          <Link
            href={`/dashboard/teams/${team.id}/billing`}
            className="rounded-lg bg-warning/20 px-3 py-1.5 text-xs font-medium text-warning-foreground hover:bg-warning/30 transition-colors"
          >
            Assinar agora
          </Link>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/teams"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {team.slug} • Gerencie os profissionais e as configurações da clínica.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <TeamMembersList
            teamId={team.id}
            members={members as never}
            currentUserRole={currentUserRole}
            currentUserId={me.id}
          />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <h3 className="text-base font-semibold">Informações</h3>
            <div className="mt-4 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Link público</p>
                <a
                  href={`/team/${team.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-primary hover:underline"
                >
                  {PUBLIC_HOST}/team/{team.slug}
                </a>
              </div>
              {currentUserRole === "OWNER" && (
                <>
                  <div>
                    <p className="font-medium text-foreground">Faturamento</p>
                    <Link
                      href={`/dashboard/teams/${team.id}/billing`}
                      className="text-brand-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      <CreditCard className="h-4 w-4" /> Gerenciar assinatura
                    </Link>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Marketing (balcão)</p>
                    <Link
                      href={`/dashboard/teams/${team.id}/marketing`}
                      className="text-care hover:underline flex items-center gap-1 mt-1"
                    >
                      <QrCode className="h-4 w-4" /> Imprimir QR Code
                    </Link>
                  </div>
                </>
              )}
              {team.description && (
                <div>
                  <p className="font-medium text-foreground">Descrição</p>
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
