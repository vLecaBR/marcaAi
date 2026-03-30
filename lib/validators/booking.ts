import { z } from "zod"

export const createBookingSchema = z.object({
  eventTypeId: z.string().cuid("EventType inválido."),
  ownerId:     z.string().cuid("Owner inválido."),

  startTimeUtc: z.string().datetime({ message: "Data de início inválida." }),
  endTimeUtc:   z.string().datetime({ message: "Data de fim inválida." }),

  guestTimeZone: z.string().min(1, "Fuso horário obrigatório."),
  guestName:     z.string().min(2, "Nome deve ter ao menos 2 caracteres.").max(128),
  guestEmail:    z.string().email("E-mail inválido."),
  guestPhone:    z.string().max(32).optional().nullable(),
  guestNotes:    z.string().max(500).optional().nullable(),

  responses: z
    .array(
      z.object({
        questionId: z.string().cuid(),
        answer:     z.string().min(1),
      })
    )
    .optional()
    .default([]),
})
.refine(
  (data) => new Date(data.startTimeUtc) < new Date(data.endTimeUtc),
  { message: "Horário de início deve ser antes do horário de fim.", path: ["startTimeUtc"] }
)
.refine(
  (data) => new Date(data.startTimeUtc) > new Date(),
  { message: "Não é possível agendar no passado.", path: ["startTimeUtc"] }
)

export type CreateBookingInput = z.infer<typeof createBookingSchema>