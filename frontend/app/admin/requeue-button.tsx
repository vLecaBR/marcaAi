"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { requeueOutboxAction } from "./actions"

export function RequeueButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null)
          const r = await requeueOutboxAction(id)
          if (!r.success) setError(r.error)
        })}
      >
        {pending ? "Reenfileirando…" : "Reenviar"}
      </Button>
    </div>
  )
}
