"use server"

/** Painel do dono — ações. A API só responde para os ids em `Admin:UserIds` (os demais recebem 404). */

import { revalidatePath } from "next/cache"
import { callApi, type ActionResult } from "@/lib/api/action-helpers"

/** Recoloca na fila uma notificação que esgotou as tentativas. */
export async function requeueOutboxAction(id: string): Promise<ActionResult<unknown>> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return { success: false, error: "Mensagem inválida." }
  const r = await callApi<unknown>(`/admin/outbox/${id}/requeue`, { method: "POST" }, "Não foi possível reenfileirar.")
  if (r.success) revalidatePath("/admin")
  return r
}
