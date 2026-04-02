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
  theme: z.enum(["DARK", "LIGHT", "SYSTEM"]).default("DARK").optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").optional().nullable(),
})

export const availabilitySchema = z.object({
  scheduleId: z.string().cuid(),
  timeZone: z.string().min(1, "Selecione um fuso horário."),
  availabilities: z.array(
    z.object({
      dayOfWeek: z.number().min(0).max(6),
      enabled: z.boolean(),
      intervals: z.array(
        z.object({
          startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido."),
          endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato inválido."),
        })
      ).refine(
        (intervals) => {
          // Checar se fim > início
          if (!intervals.every(i => i.startTime < i.endTime)) return false;
          // Se tiver mais de 1 intervalo, garantir que não se sobrepõem e estão ordenados
          for (let i = 1; i < intervals.length; i++) {
            if (intervals[i].startTime <= intervals[i - 1].endTime) return false;
          }
          return true;
        },
        { message: "Intervalos inválidos ou sobrepostos." }
      )
    })
  )
})

export type ProfileInput = z.infer<typeof profileSchema>
export type AvailabilityInput = z.infer<typeof availabilitySchema>
