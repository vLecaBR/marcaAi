import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),
  
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  
  RESEND_API_KEY: z.string().min(1).optional(),
})

const parseResult = envSchema.safeParse(process.env)

if (!parseResult.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parseResult.error.flatten().fieldErrors)
  throw new Error("Variáveis de ambiente inválidas ou ausentes.")
}

export const env = parseResult.data
