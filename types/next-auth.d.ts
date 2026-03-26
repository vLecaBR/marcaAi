// types/next-auth.d.ts
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string | null
      onboarded: boolean
      timeZone: string
    } & DefaultSession["user"]
  }

  interface User {
    username?: string | null
    onboarded?: boolean
    timeZone?: string
  }
}