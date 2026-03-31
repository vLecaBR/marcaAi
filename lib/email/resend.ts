import { Resend } from "resend"

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY não definida nas variáveis de ambiente.")
}

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "People OS <onboarding@resend.dev>"

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"