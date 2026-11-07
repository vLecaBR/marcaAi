import type { Metadata } from "next"
import { Card } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/guards"
import { PrivacyPanel } from "./components/privacy-panel"

export const metadata: Metadata = { title: "Privacidade e dados" }

export default async function PrivacyPage() {
  await requireOnboarded()
  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Privacidade e dados</h1>
        <p className="text-muted-foreground mt-1">
          Atenda pedidos dos seus pacientes (LGPD, Art. 18) e gerencie os dados da sua própria conta.
        </p>
      </div>
      <Card className="p-7 rounded-2xl border-border/60 max-w-3xl shadow-sm">
        <PrivacyPanel />
      </Card>
    </div>
  )
}
