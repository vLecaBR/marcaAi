"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { disconnectGoogleCalendarAction, startGoogleCalendarAction } from "@/lib/actions/integrations"

const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Agenda conectado." },
  denied: { ok: false, text: "A permissão de agenda não foi concedida. Tente de novo e aceite o acesso ao calendário." },
  already_linked: { ok: false, text: "Essa conta Google já está ligada a outro usuário do MarcaAí." },
  error: { ok: false, text: "Não foi possível concluir a conexão. Tente novamente." },
}

export function GoogleCalendarCard({
  available,
  connected,
  result,
}: {
  available: boolean
  connected: boolean
  result: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flash = result ? RESULT_MESSAGES[result] : null

  async function connect() {
    setBusy(true)
    setError(null)
    const r = await startGoogleCalendarAction()
    if (!r.success) {
      setError(r.error)
      setBusy(false)
      return
    }
    window.location.assign(r.data.startUrl)
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    const r = await disconnectGoogleCalendarAction()
    setBusy(false)
    if (!r.success) return setError(r.error)
    router.replace("/settings/integrations")
    router.refresh()
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Google Agenda</h2>
      <p className="text-sm text-muted-foreground">
        Opcional. Ao conectar, as consultas confirmadas viram eventos (com link do Meet, quando houver) na sua agenda do Google.
        O login com Google não pede acesso à agenda.
      </p>
      {flash && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${flash.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {flash.text}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!available ? (
        <p className="text-sm text-muted-foreground">Integração indisponível neste ambiente.</p>
      ) : connected ? (
        <Button type="button" variant="outline" disabled={busy} onClick={disconnect}>Desconectar</Button>
      ) : (
        <Button type="button" disabled={busy} onClick={connect}>Conectar Google Agenda</Button>
      )}
    </section>
  )
}
