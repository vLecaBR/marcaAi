"use server"

/**
 * Perfil e conclusão de onboarding — proxy fino para a API .NET (Fase 5). Sem Prisma/NextAuth.
 * `PUT /me/profile` e `POST /me/onboarding/complete`.
 *
 * Observação: a rotação de token (`/auth/refresh`) após salvar o perfil deve ser disparada pelo
 * client (o cookie só pode ser reescrito num Route Handler) — ver `components/.../profile-form`.
 */

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { profileSchema } from "@/lib/validators/onboarding"
import { endpoints } from "@/lib/api/endpoints"
import { callApi, type ActionResult } from "@/lib/api/action-helpers"

export async function completeProfileAction(
  raw: z.infer<typeof profileSchema>,
): Promise<ActionResult<{ username: string }>> {
  const parsed = profileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { name, username, timeZone, bio, theme, brandColor, specialty, council, registrationNumber, clinicName } = parsed.data
  const result = await callApi(
    endpoints.me.profile,
    {
      method: "PUT",
      body: {
        name, username, timeZone, bio: bio ?? null, theme, brandColor: brandColor ?? null,
        specialty: specialty || null, council: council || null,
        registrationNumber: registrationNumber || null, clinicName: clinicName || null,
      },
    },
    "Erro ao atualizar o perfil.",
  )
  if (result.success) revalidatePath("/settings/profile")
  return result.success ? { success: true, data: { username } } : result
}

export async function completeOnboardingAction(): Promise<ActionResult> {
  const result = await callApi(
    endpoints.me.onboardingComplete,
    { method: "POST" },
    "Erro ao concluir o onboarding.",
  )
  if (result.success) revalidatePath("/dashboard")
  return result.success ? { success: true, data: undefined } : result
}
