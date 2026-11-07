"use server"

/**
 * Ações de agendamento do profissional — proxy para a API .NET (Fase 5). Sem Prisma/NextAuth/Google.
 *
 * Aprovação manual: `POST /bookings/{uid}/confirm` (dono ou gestor da clínica) cria o evento no Google
 * (best-effort) e notifica o paciente. Cancelamento: `POST /bookings/{uid}/cancel` (reembolso conforme D6).
 */

import { revalidatePath } from "next/cache"
import { endpoints } from "@/lib/api/endpoints"
import { callApi, type ActionResult } from "@/lib/api/action-helpers"

export async function approveBookingAction(uid: string): Promise<ActionResult> {
  const result = await callApi(
    endpoints.bookings.confirm(uid),
    { method: "POST" },
    "Erro ao aprovar o agendamento.",
  )
  if (result.success) {
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/bookings")
  }
  return result.success ? { success: true, data: undefined } : result
}

export async function rejectBookingAction(uid: string, reason: string): Promise<ActionResult> {
  const result = await callApi(
    endpoints.bookings.cancel(uid),
    { method: "POST", body: { reason, canceledBy: "OWNER" } },
    "Erro ao cancelar o agendamento.",
  )
  if (result.success) {
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/bookings")
  }
  return result.success ? { success: true, data: undefined } : result
}
