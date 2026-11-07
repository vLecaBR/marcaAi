import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"

export const metadata: Metadata = { title: "Paciente" }

interface Detail {
  summary: { email: string; name: string; phone: string | null; totalBookings: number; cancelledBookings: number; totalPaidCents: number }
  bookings: { uid: string; eventTitle: string; startTime: string; status: string; paymentStatus: string; priceCents: number | null }[]
}

const STATUS: Record<string, string> = { CONFIRMED: "Confirmada", PENDING: "Pendente", CANCELLED: "Cancelada", NO_SHOW: "Faltou", RESCHEDULED: "Remarcada" }
const PAY: Record<string, string> = { PAID: "Pago", UNPAID: "—", PENDING: "Aguardando", REFUNDED: "Reembolsado", PARTIALLY_REFUNDED: "Reemb. parcial", FAILED: "Falhou" }
const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)

export default async function PatientDetailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  await requireOnboarded()
  const { email } = await searchParams
  if (!email) notFound()
  let d: Detail
  try {
    d = await serverApiFetch<Detail>(endpoints.patientDetail, { query: { email } })
  } catch (err) {
    if (isApiError(err) && (err.kind === "not_found" || err.status === 404)) notFound()
    throw err
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/patients" className="text-sm text-muted-foreground hover:text-foreground">← Pacientes</Link>
      <div>
        <h1 className="text-2xl font-semibold">{d.summary.name}</h1>
        <p className="text-sm text-muted-foreground">
          {d.summary.email}{d.summary.phone ? ` · ${d.summary.phone}` : ""} · {d.summary.totalBookings} consulta(s)
          {d.summary.totalPaidCents ? ` · ${brl(d.summary.totalPaidCents)} pagos` : ""}
        </p>
      </div>
      <Card className="overflow-hidden rounded-2xl border-border/60">
        <ul className="divide-y divide-border/60">
          {d.bookings.map((b) => (
            <li key={b.uid} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{b.eventTitle}</div>
                <div className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(b.startTime))}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{STATUS[b.status] ?? b.status}</span>
                <span className="tabular-nums">{b.priceCents ? `${brl(b.priceCents)} · ${PAY[b.paymentStatus] ?? b.paymentStatus}` : "Gratuita"}</span>
                <Link href={`/booking/${b.uid}`} className="underline">Abrir</Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted-foreground">
        Para exportar os dados deste paciente ou anonimizá-los (LGPD), use{" "}
        <Link href="/settings/privacy" className="underline">Configurações → Privacidade</Link>.
      </p>
    </div>
  )
}
