import { z } from "zod"

export const eventTypeQuestionSchema = z.object({
  id: z.string().cuid().optional(),
  label: z.string().min(2, "A pergunta deve ter ao menos 2 caracteres."),
  type: z.enum(["TEXT", "TEXTAREA", "SELECT", "CHECKBOX", "PHONE"]),
  placeholder: z.string().optional().nullable(),
  required: z.boolean().default(false),
  order: z.number().int().default(0),
})

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
  
  beforeEventBuffer: z.number().min(0).max(60).default(0),
  afterEventBuffer: z.number().min(0).max(60).default(0),
  bookingLimitDays: z.number().min(1).max(365).optional().nullable(),
  
  locationType: z.enum([
    "GOOGLE_MEET","ZOOM","TEAMS","PHONE","IN_PERSON","CUSTOM",
  ]),
  locationValue: z.string().max(255).optional().nullable(),
  price: z.number().min(0, "Preço inválido").optional().nullable(),

  questions: z.array(eventTypeQuestionSchema).optional().default([]),
})

export type EventTypeQuestionInput = z.infer<typeof eventTypeQuestionSchema>
export type EventTypeInput = z.infer<typeof eventTypeSchema>