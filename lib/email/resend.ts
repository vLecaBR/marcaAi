import { Resend } from "resend"

const resendApiKey = process.env.RESEND_API_KEY || "mock-api-key"

export const resend = new Resend(resendApiKey)

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "People OS <onboarding@resend.dev>"

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"