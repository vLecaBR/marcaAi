import type { Metadata } from "next"
import Link from "next/link"
import { Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"

export const metadata: Metadata = { title: "Pacientes" }

interface PatientSummary {
  email: string
  name: string
  phone: string | null
  totalBookings: number
  cancelledBookings: number
  lastBookingAt: string | null
  nextBookingAt: string | null
  totalPaidCents: number
}

const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—")

/**
 * Pacientes do profissional — derivados das consultas (agrupados por e-mail). Contato, histórico e total pago.
 * Não há prontuário nem anotações clínicas: este produto organiza a agenda e o recebimento.
 */
export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOnboarded()
  const { q } = await searchParams
  const list = await serverApiFetch<PatientSummary[]>(endpoints.patients, { query: q ? { q } : undefined }).catch(() => [] as PatientSummary[])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pacientes</h1>
        <p className="text-sm text-muted-foreground">
          Quem já agendou com você, com histórico de consultas e valores pagos.
          {q ? <> Filtrando por <b>“{q}”</b>. <Link href="/dashboard/patients" className="underline">Limpar</Link></> : null}
        </p>
      </div>

      {list.length === 0 ? (
        <Card className="rounded-2xl border-2 border-dashed border-border shadow-none">
          <EmptyState
            icon={Users}
            title={q ? "Nenhum paciente encontrado" : "Nenhum paciente ainda"}
            description={q ? "Tente buscar por outro nome, e-mail ou telefone." : "Quando alguém agendar pelo seu link, o paciente aparece aqui."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl border-border/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Consultas</th>
                  <th className="px-4 py-3">Última</th>
                  <th className="px-4 py-3">Próxima</th>
                  <th className="px-4 py-3 text-right">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {list.map((p) => (
                  <tr key={p.email} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/patients/detail?email=${encodeURIComponent(p.email)}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{p.email}{p.phone ? ` · ${p.phone}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {p.totalBookings}
                      {p.cancelledBookings > 0 && <span className="text-xs text-muted-foreground"> (+{p.cancelledBookings} canc.)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{day(p.lastBookingAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{day(p.nextBookingAt)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.totalPaidCents ? brl(p.totalPaidCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
