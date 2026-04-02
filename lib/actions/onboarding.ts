"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { profileSchema } from "@/lib/validators/onboarding"
import { revalidatePath } from "next/cache"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function completeProfileAction(
  raw: z.infer<typeof profileSchema>
): Promise<ActionResult<{ username: string }>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Não autorizado." }
  }

  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { name, username, timeZone, bio, theme, brandColor } = parsed.data

  // Verifica unicidade do username (exceto o próprio user)
  const existing = await prisma.user.findFirst({
    where: {
      username,
      NOT: { id: session.user.id },
    },
  })

  if (existing) {
    return { success: false, error: "Este username já está em uso." }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name, username, timeZone, bio: bio ?? null, theme: theme as any, brandColor: brandColor ?? null },
  })

  revalidatePath("/onboarding")
  return { success: true, data: { username } }
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Não autorizado." }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboarded: true },
  })

  revalidatePath("/dashboard")
  return { success: true, data: undefined }
}