"use client"

import { useMemo, useRef } from "react"
import { newIdempotencyKey } from "@/lib/idempotency"

/**
 * Chave de idempotência da tentativa atual. `get()` devolve a mesma chave enquanto não houver resposta HTTP (duplo clique,
 * retry de rede); `rotate()` troca por uma nova — chame depois de receber qualquer resposta. O valor mora numa ref dentro do
 * hook, então só é lido em manipuladores de evento, nunca durante a renderização.
 */
export function useIdempotencyKey() {
  const ref = useRef<string | null>(null)
  return useMemo(
    () => ({
      get(): string {
        if (!ref.current) ref.current = newIdempotencyKey()
        return ref.current
      },
      rotate(): void {
        ref.current = newIdempotencyKey()
      },
    }),
    [],
  )
}
