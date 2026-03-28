"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { eventTypeSchema, type EventTypeInput } from "@/lib/validators/event-type"
import { revalidatePath } from "next/cache"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Listar ────────────────────────────────────────────────────────────────────

export async function getEventTypesAction() {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      duration: true,
      color: true,
      isActive: true,
      requiresConfirm: true,
      beforeEventBuffer: true,
      afterEventBuffer: true,
      bookingLimitDays: true,
      locationType: true,
      locationValue: true,
      _count: { select: { bookings: true } },
    },
  })

  return { success: true, data: eventTypes }
}

// ── Criar / Atualizar ─────────────────────────────────────────────────────────

export async function upsertEventTypeAction(
  raw: EventTypeInput
): Promise<ActionResult<{ id: string; slug: string }>> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const parsed = eventTypeSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { id, ...data } = parsed.data

  // Verifica unicidade do slug para este user
  const slugConflict = await prisma.eventType.findFirst({
    where: {
      userId: session.user.id,
      slug: data.slug,
      NOT: id ? { id } : undefined,
    },
  })

  if (slugConflict) {
    return { success: false, error: "Você já tem um evento com este slug." }
  }

  const eventType = await prisma.eventType.upsert({
    where: { id: id ?? "" },
    create: { ...data, userId: session.user.id },
    update: data,
    select: { id: true, slug: true },
  })

  revalidatePath("/dashboard/event-types")
  return { success: true, data: eventType }
}

// ── Ativar / Desativar ────────────────────────────────────────────────────────

export async function toggleEventTypeAction(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const eventType = await prisma.eventType.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!eventType) return { success: false, error: "Evento não encontrado." }

  await prisma.eventType.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath("/dashboard/event-types")
  return { success: true, data: undefined }
}

// ── Deletar ───────────────────────────────────────────────────────────────────

export async function deleteEventTypeAction(
  id: string
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const eventType = await prisma.eventType.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!eventType) return { success: false, error: "Evento não encontrado." }

  await prisma.eventType.delete({ where: { id } })

  revalidatePath("/dashboard/event-types")
  return { success: true, data: undefined }
}