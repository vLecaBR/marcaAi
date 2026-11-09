"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  anonymizePatientAction,
  deleteAccountAction,
  exportAccountAction,
  exportPatientAction,
} from "@/lib/actions/privacy"

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function PrivacyPanel() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [confirm, setConfirm] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    try { await fn() } finally { setBusy(false) }
  }

  const exportPatient = () => run(async () => {
    const r = await exportPatientAction(email)
    if (!r.success) return setMsg({ ok: false, text: r.error })
    download(`dados-paciente.json`, r.data)
    setMsg({ ok: true, text: "Exportação gerada." })
  })

  const anonymize = () => run(async () => {
    if (!window.confirm("Anonimizar este paciente em todas as suas consultas? Esta ação não pode ser desfeita.")) return
    const r = await anonymizePatientAction(email)
    setMsg(r.success ? { ok: true, text: `${r.data.anonimizadas} consulta(s) anonimizada(s).` } : { ok: false, text: r.error })
  })

  const exportAccount = () => run(async () => {
    const r = await exportAccountAction()
    if (!r.success) return setMsg({ ok: false, text: r.error })
    download("meus-dados.json", r.data)
    setMsg({ ok: true, text: "Exportação gerada." })
  })

  const deleteAccount = () => run(async () => {
    const r = await deleteAccountAction(confirm)
    if (!r.success) return setMsg({ ok: false, text: r.error })
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null)
    router.push("/")
    router.refresh() // descarta o cache de dados do usuário que acabou de sair
  })

  return (
    <div className="space-y-10">
      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
          {msg.text}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Dados de um paciente</h2>
        <p className="text-sm text-muted-foreground">
          Informe o e-mail usado no agendamento. <strong>Exportar</strong> gera um arquivo com tudo o que está registrado
          (acesso/portabilidade). <strong>Anonimizar</strong> remove nome, e-mail, telefone, observações e respostas das suas
          consultas, mantendo apenas o registro financeiro exigido por lei.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="paciente@email.com" className="h-11 rounded-xl" />
          <Button type="button" variant="outline" disabled={busy || !email} onClick={exportPatient}>Exportar</Button>
          <Button type="button" variant="destructive" disabled={busy || !email} onClick={anonymize}>Anonimizar</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Meus dados</h2>
        <p className="text-sm text-muted-foreground">Baixe os dados da sua conta (perfil, tipos de consulta e clínicas).</p>
        <Button type="button" variant="outline" disabled={busy} onClick={exportAccount}>Exportar meus dados</Button>
      </section>

      <section className="space-y-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="text-base font-semibold text-destructive">Excluir minha conta</h2>
        <p className="text-sm text-muted-foreground">
          Apaga sua conta, agenda, tipos de consulta e as consultas (com os dados dos pacientes). Cancele antes qualquer assinatura
          ativa. Contas de recebimento no Stripe/Mercado Pago devem ser encerradas nos próprios provedores. Digite <strong>EXCLUIR</strong> para confirmar.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="EXCLUIR" className="h-11 rounded-xl" />
          <Button type="button" variant="destructive" disabled={busy || confirm !== "EXCLUIR"} onClick={deleteAccount}>Excluir conta</Button>
        </div>
      </section>
    </div>
  )
}
