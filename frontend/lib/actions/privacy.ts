"use server"

/**
 * Direitos do titular (LGPD Art. 18) — proxies para `/privacy/*`. O e-mail do paciente vai no corpo (POST),
 * nunca na URL. Ver backend `PrivacyController`.
 */

import { z } from "zod"
import { endpoints } from "@/lib/api/endpoints"
import { callApi, type ActionResult } from "@/lib/api/action-helpers"

const emailSchema = z.string().trim().email("Informe um e-mail válido.")

/** Exporta (JSON) tudo o que a plataforma guarda sobre um paciente nas consultas do profissional. */
export async function exportPatientAction(email: string): Promise<ActionResult<unknown>> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return callApi<unknown>(endpoints.privacy.exportPatient, { method: "POST", body: { email: parsed.data } }, "Erro ao exportar os dados.")
}

/** Anonimiza o paciente nas consultas do profissional (mantém só o registro financeiro). */
export async function anonymizePatientAction(email: string): Promise<ActionResult<{ anonimizadas: number }>> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return callApi<{ anonimizadas: number }>(endpoints.privacy.anonymizePatient, { method: "POST", body: { email: parsed.data } }, "Erro ao anonimizar.")
}

export async function exportAccountAction(): Promise<ActionResult<unknown>> {
  return callApi<unknown>(endpoints.privacy.exportAccount, { method: "GET" }, "Erro ao exportar os dados da conta.")
}

/** Exclui a conta do profissional e seus dados. Exige digitar EXCLUIR. */
export async function deleteAccountAction(confirm: string): Promise<ActionResult> {
  const result = await callApi(endpoints.privacy.deleteAccount, { method: "DELETE", body: { confirm } }, "Erro ao excluir a conta.")
  return result.success ? { success: true, data: undefined } : result
}
