import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { isApiError } from "@/lib/api/problem-details"

export const metadata: Metadata = { title: "Painel do dono", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

interface Overview {
  generatedAt: string
  users: { total: number; onboarded: number; newLast7Days: number; activated: number }
  bookings: { byStatus: { status: string; n: number }[]; createdLast7Days: number; upcomingConfirmed: number; pendingPayment: number }
  payments: { paidCount: number; grossCents: number; platformFeeCents: number }
  errors: { last24h: number; recent: { source: string; message: string; path: string | null; status: number | null; createdAt: string }[] }
}

const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)

/** Painel do dono (ids em `Admin:UserIds`): números agregados e erros recentes. Para os demais usuários a rota não existe (404). */
export default async function AdminPage() {
  await requireOnboarded()
  let o: Overview
  try {
    o = await serverApiFetch<Overview>("/admin/overview")
  } catch (err) {
    if (isApiError(err) && (err.kind === "not_found" || err.status === 404)) notFound()
    throw err
  }
  const pct = o.users.total ? Math.round((o.users.activated / o.users.total) * 100) : 0

  const tile = (label: string, value: string | number, hint?: string) => (
    <Card className="rounded-2xl border-border/60 p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Painel do dono</h1>
        <p className="text-sm text-muted-foreground">Dados agregados (sem informações de pacientes). Atualizado em {new Date(o.generatedAt).toLocaleString("pt-BR")}.</p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tile("Cadastros", o.users.total, `${o.users.newLast7Days} nos últimos 7 dias`)}
        {tile("Onboarding concluído", o.users.onboarded)}
        {tile("Ativados", `${o.users.activated} (${pct}%)`, "concluíram o onboarding e já têm consulta")}
        {tile("Próximas consultas", o.bookings.upcomingConfirmed, `${o.bookings.createdLast7Days} criadas em 7 dias`)}
        {tile("Aguardando pagamento", o.bookings.pendingPayment)}
        {tile("Pagamentos", o.payments.paidCount, brl(o.payments.grossCents))}
        {tile("Taxa da plataforma", brl(o.payments.platformFeeCents))}
        {tile("Erros (24 h)", o.errors.last24h, o.errors.last24h ? "veja abaixo" : "tudo calmo")}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Consultas por status</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {o.bookings.byStatus.map((s) => (
            <span key={s.status} className="rounded-full bg-muted px-3 py-1">{s.status}: <b>{s.n}</b></span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Erros recentes</h2>
        {o.errors.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum erro registrado.</p>
        ) : (
          <Card className="overflow-hidden rounded-2xl border-border/60">
            <ul className="divide-y divide-border/60 text-sm">
              {o.errors.recent.map((e, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">{e.source}</span>
                    <span className="font-medium">{e.message}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("pt-BR")}{e.path ? ` · ${e.path}` : ""}{e.status ? ` · ${e.status}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  )
}
