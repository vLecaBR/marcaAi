import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: { strategy: "jwt" },

  ...authConfig,

  callbacks: {
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
      if (!user.id) return

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
    },
  },
})