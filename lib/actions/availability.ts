"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { availabilitySchema } from "@/lib/validators/onboarding"
import { revalidatePath } from "next/cache"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function saveAvailabilityAction(
  raw: z.infer<typeof availabilitySchema>
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Não autorizado." }
  }

  const parsed = availabilitySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { scheduleId, timeZone, availabilities } = parsed.data

  // Confirma que o schedule pertence ao usuário
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, userId: session.user.id },
  })

  if (!schedule) {
    return { success: false, error: "Agenda não encontrada." }
  }

  // Upsert atômico: recria as availabilities do zero
  await prisma.$transaction([
    prisma.schedule.update({
      where: { id: scheduleId },
      data: { timeZone },
    }),
    prisma.scheduleAvailability.deleteMany({
      where: { scheduleId },
    }),
    prisma.scheduleAvailability.createMany({
      data: availabilities
        .filter((d) => d.enabled)
        .map((d) => ({
          scheduleId,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
        })),
    }),
  ])

  revalidatePath("/settings/availability")
  return { success: true, data: undefined }
}