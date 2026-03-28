import { z } from "zod"

export const profileSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter ao menos 2 caracteres.")
    .max(64, "Nome muito longo."),
  username: z
    .string()
    .min(3, "Username deve ter ao menos 3 caracteres.")
    .max(32, "Username muito longo.")
    .regex(
      /^[a-z0-9-]+$/,
      "Apenas letras minúsculas, números e hífens."
    ),
  timeZone: z.string().min(1, "Selecione um fuso horário."),
  bio: z.string().max(160, "Bio deve ter no máximo 160 caracteres.").optional(),
})

export const availabilitySchema = z.object({
  scheduleId: z.string().cuid(),
  timeZone: z.string().min(1, "Selecione um fuso horário."),
  availabilities: z
    .array(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        enabled: z.boolean(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido."),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido."),
      })
    )
    .refine(
      (days) =>
        days.every(
          (d) => !d.enabled || d.startTime < d.endTime
        ),
      { message: "Horário de início deve ser antes do horário de fim." }
    ),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type AvailabilityInput = z.infer<typeof availabilitySchema>