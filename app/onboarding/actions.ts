"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { onboardingSchema } from "@/lib/validators/onboarding"

export async function submitOnboarding(formData: FormData) {
  const session = await auth()
  
  if (!session?.user?.id) {
    return { error: "Não autorizado." }
  }

  const rawData = {
    username: formData.get("username"),
    timeZone: formData.get("timeZone"),
    theme: formData.get("theme") || "DARK",
  }

  const parsed = onboardingSchema.safeParse(rawData)

  if (!parsed.success) {
    return { error: "Dados inválidos.", details: parsed.error.flatten().fieldErrors }
  }

  const { username, timeZone, theme } = parsed.data

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username }
    })

    if (existingUser && existingUser.id !== session.user.id) {
      return { error: "Este nome de usuário já está em uso." }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username,
        timeZone,
        theme,
        onboarded: true
      }
    })

    // If using JWT strategy, the token needs to be updated. This is handled by Auth.js 
    // when calling `update()` on the client side, or it will be fresh on next login.
    // In server actions with NextAuth v5, returning success is often enough for the client
    // to trigger session update or redirection.

    return { success: true }
  } catch (error) {
    console.error("Erro no onboarding:", error)
    return { error: "Ocorreu um erro ao salvar as configurações." }
  }
}