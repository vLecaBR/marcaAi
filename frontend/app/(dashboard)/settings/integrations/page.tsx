import type { Metadata } from "next"
import { Card } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { GoogleCalendarCard } from "./components/google-calendar-card"

export const metadata: Metadata = { title: "Integrações" }

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>
}) {
  await requireOnboarded()
  const { calendar } = await searchParams
  const status = await serverApiFetch<{ available: boolean; connected: boolean }>(
    endpoints.integrations.googleCalendar,
  ).catch(() => ({ available: false, connected: false }))

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Integrações</h1>
        <p className="text-muted-foreground mt-1">Conecte serviços opcionais à sua agenda.</p>
      </div>
      <Card className="p-7 rounded-2xl border-border/60 max-w-3xl shadow-sm">
        <GoogleCalendarCard available={status.available} connected={status.connected} result={calendar ?? null} />
      </Card>
    </div>
  )
}
