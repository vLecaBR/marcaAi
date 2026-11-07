"use server"

/**
 * Tipos de consulta — proxy fino para a API .NET (Fase 5). Sem Prisma/NextAuth.
 * Assinaturas preservadas para os componentes client (`EventTypeList`/`Form`/`Card`).
 *
 * O upsert envia também as `questions` (formulário pré-consulta); a API substitui a lista inteira.
 */

import { revalidatePath } from "next/cache"
import { eventTypeSchema, type EventTypeInput } from "@/lib/validators/event-type"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { apiAction, callApi, type ActionResult } from "@/lib/api/action-helpers"
import type { EventTypeSummaryDto } from "@/lib/api/types"

export async function getEventTypesAction(): Promise<ActionResult<EventTypeSummaryDto[]>> {
  return callApi<EventTypeSummaryDto[]>(endpoints.eventTypes.root, { method: "GET" }, "Erro ao listar.")
}

export async function upsertEventTypeAction(
  raw: EventTypeInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = eventTypeSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { id, ...rest } = parsed.data
  const body = {
    title: rest.title,
    slug: rest.slug,
    description: rest.description ?? null,
    duration: rest.duration,
    color: rest.color,
    isActive: rest.isActive,
    requiresConfirm: rest.requiresConfirm,
    beforeEventBuffer: rest.beforeEventBuffer,
    afterEventBuffer: rest.afterEventBuffer,
    bookingLimitDays: rest.bookingLimitDays ?? null,
    locationType: rest.locationType,
    locationValue: rest.locationValue ?? null,
    price: rest.price != null ? Math.round(rest.price) : null,
    payOnSite: rest.payOnSite ?? false,
    currency: "BRL",
    questions: (rest.questions ?? []).map((q, i) => ({
      label: q.label,
      type: q.type,
      placeholder: q.placeholder ?? null,
      required: q.required,
      order: i + 1,
    })),
  }

  const result = await apiAction(async () => {
    if (id) {
      await serverApiFetch(endpoints.eventTypes.byId(id), { method: "PUT", body })
      return { id, slug: rest.slug }
    }
    const created = await serverApiFetch<EventTypeSummaryDto>(endpoints.eventTypes.root, {
      method: "POST",
      body,
    })
    return { id: created?.id ?? "", slug: created?.slug ?? rest.slug }
  }, "Erro ao salvar o tipo de consulta.")

  if (result.success) revalidatePath("/dashboard/event-types")
  return result
}

export async function toggleEventTypeAction(id: string, isActive: boolean): Promise<ActionResult> {
  const result = await callApi(
    endpoints.eventTypes.status(id),
    { method: "PATCH", body: { isActive } },
    "Erro ao atualizar o status.",
  )
  if (result.success) revalidatePath("/dashboard/event-types")
  return result.success ? { success: true, data: undefined } : result
}

export async function deleteEventTypeAction(id: string): Promise<ActionResult> {
  const result = await callApi(
    endpoints.eventTypes.byId(id),
    { method: "DELETE" },
    "Erro ao remover.",
  )
  if (result.success) revalidatePath("/dashboard/event-types")
  return result.success ? { success: true, data: undefined } : result
}
