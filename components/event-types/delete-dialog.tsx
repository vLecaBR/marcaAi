// components/event-types/delete-dialog.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { deleteEventTypeAction } from "@/lib/actions/event-types"
import { cn } from "@/lib/utils"

interface DeleteDialogProps {
  open: boolean
  onClose: () => void
  eventTypeId: string
  eventTypeTitle: string
}

export function DeleteDialog({
  open,
  onClose,
  eventTypeId,
  eventTypeTitle,
}: DeleteDialogProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    const result = await deleteEventTypeAction(eventTypeId)
    if (result.success) {
      router.refresh()
      onClose()
    } else {
      setError(result.error)
      setIsDeleting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10">
          <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h3 className="text-base font-semibold text-white">Excluir tipo de evento</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Tem certeza que deseja excluir{" "}
          <span className="font-medium text-white">"{eventTypeTitle}"</span>?
          Esta ação não pode ser desfeita e todos os agendamentos futuros serão afetados.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className={cn(
              "flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-medium text-white",
              "transition-all hover:bg-rose-500 active:scale-[0.99]",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            {isDeleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  )
}