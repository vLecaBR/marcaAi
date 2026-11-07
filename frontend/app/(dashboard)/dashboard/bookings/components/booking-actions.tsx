"use client"

import { useState } from "react"
import { approveBookingAction, rejectBookingAction } from "../actions"
import { CheckCircle2, XCircle } from "lucide-react"

export function BookingActions({ uid, status }: { uid: string, status: string }) {
  const [loading, setLoading] = useState(false)

  async function handleApprove() {
    setLoading(true)
    await approveBookingAction(uid)
    setLoading(false)
  }

  async function handleReject() {
    const reason = prompt(status === "PENDING" ? "Motivo da recusa (opcional):" : "Motivo do cancelamento (opcional):") ?? (status === "PENDING" ? "Recusado pelo profissional." : "Cancelado pelo profissional.")
    setLoading(true)
    await rejectBookingAction(uid, reason)
    setLoading(false)
  }

  const remarcar = (
    <a
      href={`/booking/${uid}/reschedule`}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      Remarcar
    </a>
  )

  if (status === "CONFIRMED") {
    return (
      <div className="flex items-center gap-2">
        {remarcar}
        <button
          onClick={handleReject}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancelar
        </button>
      </div>
    )
  }

  if (status !== "PENDING") return null

  return (
    <div className="flex items-center gap-2">
      {remarcar}
      <button
        onClick={handleReject}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
      >
        <XCircle className="h-3.5 w-3.5" />
        Recusar
      </button>
      <button
        onClick={handleApprove}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aprovar
      </button>
    </div>
  )
}
