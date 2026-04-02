import { z } from "zod"

export const teamSchema = z.object({
  id: z.string().cuid().optional(),
  name: z
    .string()
    .min(2, "Nome deve ter ao menos 2 caracteres.")
    .max(64, "Nome muito longo."),
  slug: z
    .string()
    .min(2, "Slug deve ter ao menos 2 caracteres.")
    .max(64, "Slug muito longo.")
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens."),
  description: z.string().max(500).optional().nullable(),
  theme: z.enum(["DARK", "LIGHT", "SYSTEM"]).default("DARK").optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").optional().nullable(),
})

export type TeamInput = z.infer<typeof teamSchema>

export const inviteMemberSchema = z.object({
  teamId: z.string().cuid(),
  email: z.string().email("E-mail inválido."),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
})

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>