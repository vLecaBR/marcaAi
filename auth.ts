import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: { strategy: "jwt" },

  ...authConfig,

  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("[AUTH DEBUG] signIn callback triggered:", { userId: user.id, email: user.email, provider: account?.provider })
      return true
    },
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (authConfig.callbacks?.jwt) {
        // Run the base jwt callback to handle triggers and users
        token = await authConfig.callbacks.jwt({ token, user, trigger, session }) as any
      }

      // Busca do banco apenas no login inicial ou atualização explícita da sessão
      if (user || trigger === "signIn" || trigger === "update") {
        if (token.id) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { username: true, onboarded: true, timeZone: true }
          })

          if (dbUser) {
            token.username = dbUser.username
            token.onboarded = dbUser.onboarded
            token.timeZone = dbUser.timeZone
          }
        }
      }

      return token
    },
  },

  events: {
    async createUser({ user }) {
      console.log("[AUTH DEBUG] createUser event triggered for user:", user.email)
      if (!user.id) return

      try {
        await prisma.schedule.create({
          data: {
            userId: user.id,
            name: "Agenda Padrão",
            timeZone: "America/Sao_Paulo",
            isDefault: true,
            availabilities: {
              createMany: {
                data: [
                  { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
                  { dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
                  { dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
                  { dayOfWeek: 4, startTime: "09:00", endTime: "18:00" },
                  { dayOfWeek: 5, startTime: "09:00", endTime: "18:00" },
                ],
              },
            },
          },
        })
        console.log("[AUTH DEBUG] Padrão schedule created successfully")
      } catch (error) {
        console.error("[AUTH DEBUG] Error creating default schedule:", error)
      }
    },
  },
})