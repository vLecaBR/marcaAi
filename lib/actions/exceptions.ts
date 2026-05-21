"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const exceptionSchema = z.object({
  scheduleId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  type: z.enum(["BLOCKED", "VACATION", "OVERRIDE"]).default("BLOCKED"),
  reason: z.string().max(100, "Motivo muito longo").optional(),
})

export async function addExceptionAction(raw: z.infer<typeof exceptionSchema>) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado" }

  const parsed = exceptionSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: "Dados inválidos." }

  const { scheduleId, date, type, reason } = parsed.data

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, userId: session.user.id },
  })

  if (!schedule) return { success: false, error: "Agenda não encontrada." }

  const parsedDate = new Date(`${date}T12:00:00.000Z`)

  // Check if exception already exists for this date
  const existing = await prisma.scheduleException.findFirst({
    where: { scheduleId, date: parsedDate }
  })

  if (existing) {
    return { success: false, error: "Já existe um bloqueio para esta data." }
  }

  await prisma.scheduleException.create({
    data: {
      scheduleId,
      userId: session.user.id,
      date: parsedDate,
      type,
      reason,
      // For now, full day blocking (no specific time)
      startTime: null,
      endTime: null,
    },
  })

  revalidatePath("/settings/availability")
  return { success: true }
}

export async function removeExceptionAction(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado" }

  const exception = await prisma.scheduleException.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!exception) return { success: false, error: "Bloqueio não encontrado ou sem permissão" }

  await prisma.scheduleException.delete({
    where: { id, userId: session.user.id },
  })

  revalidatePath("/settings/availability")
  return { success: true }
}
