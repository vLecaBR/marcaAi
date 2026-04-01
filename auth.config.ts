import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
      }
      // Se houver um trigger de update, atualiza o token
      if (trigger === "update" && session) {
        token = { ...token, ...session }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const customToken = token as { username?: string, onboarded?: boolean, timeZone?: string }
        session.user.id = token.id as string
        session.user.username = customToken.username ?? null
        session.user.onboarded = customToken.onboarded ?? false
        session.user.timeZone = customToken.timeZone ?? "America/Sao_Paulo"
      }
      return session
    },
  }
} satisfies NextAuthConfig
