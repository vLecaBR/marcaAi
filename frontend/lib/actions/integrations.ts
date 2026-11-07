"use server"

/** Integrações opcionais do profissional. Hoje: Google Agenda (OAuth separado do login). */

import { endpoints } from "@/lib/api/endpoints"
import { callApi, type ActionResult } from "@/lib/api/action-helpers"

/** Pede à API o link de início do OAuth do Calendar (código de uso único, 5 min). O navegador então abre `startUrl`. */
export async function startGoogleCalendarAction(): Promise<ActionResult<{ startUrl: string }>> {
  return callApi<{ startUrl: string }>(
    endpoints.integrations.googleCalendarLink,
    { method: "POST" },
    "Não foi possível iniciar a conexão com o Google Agenda.",
  )
}

export async function disconnectGoogleCalendarAction(): Promise<ActionResult> {
  const r = await callApi(endpoints.integrations.googleCalendar, { method: "DELETE" }, "Não foi possível desconectar.")
  return r.success ? { success: true, data: undefined } : r
}
