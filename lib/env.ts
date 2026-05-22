import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  
  RESEND_API_KEY: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.STRIPE_SECRET_KEY && !data.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "STRIPE_WEBHOOK_SECRET é obrigatório quando a integração Stripe está ativada",
      path: ["STRIPE_WEBHOOK_SECRET"],
    });
  }
});

let envVars = process.env;

// Ignora validação rigorosa durante o build para não quebrar a compilação inicial da Vercel
// caso as chaves ainda não tenham sido configuradas no painel.
if (!process.env.DATABASE_URL && (process.env.npm_lifecycle_event === "build" || process.env.VERCEL)) {
  console.warn("⚠️  Aviso: Usando variáveis de ambiente de MOCK para permitir o Build. Você precisa preencher as variáveis reais na aba Settings > Environment Variables da Vercel.");
  envVars = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/mockdb",
    AUTH_SECRET: process.env.AUTH_SECRET || "mock-secret",
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID || "mock-id",
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET || "mock-secret",
  } as any;
}

const parseResult = envSchema.safeParse(envVars)

if (!parseResult.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parseResult.error.flatten().fieldErrors)
  throw new Error("Variáveis de ambiente inválidas ou ausentes")
}

export const env = parseResult.data
