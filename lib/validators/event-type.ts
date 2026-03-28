import { z } from "zod"

export const eventTypeSchema = z.object({
  id: z.string().cuid().optional(),
  title: z
    .string()
    .min(2, "Título deve ter ao menos 2 caracteres.")
    .max(64, "Título muito longo."),
  slug: z
    .string()
    .min(2, "Slug deve ter ao menos 2 caracteres.")
    .max(64, "Slug muito longo.")
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens."),
  description: z.string().max(500).optional().nullable(),
  
  // REMOVIDO O .coerce DAQUI
  duration: z
    .number()
    .min(5, "Duração mínima de 5 minutos.")
    .max(480, "Duração máxima de 8 horas."),
    
  color: z.enum([
    "SLATE","ROSE","ORANGE","AMBER",
    "EMERALD","TEAL","CYAN","VIOLET","FUCHSIA",
  ]),
  isActive: z.boolean().default(true),
  requiresConfirm: z.boolean().default(false),
  
  // REMOVIDO O .coerce DOS BUFFERS E LIMITES TAMBÉM
  beforeEventBuffer: z.number().min(0).max(60).default(0),
  afterEventBuffer: z.number().min(0).max(60).default(0),
  bookingLimitDays: z.number().min(1).max(365).optional().nullable(),
  
  locationType: z.enum([
    "GOOGLE_MEET","ZOOM","TEAMS","PHONE","IN_PERSON","CUSTOM",
  ]),
  locationValue: z.string().max(255).optional().nullable(),
})

export type EventTypeInput = z.infer<typeof eventTypeSchema>