import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: { strategy: "jwt" },

  ...authConfig,

  callbacks: {
async jwt({ token, user }) {
  if (user) {
    token.id = user.id
  }

  // 🔥 SEMPRE busca do banco
  if (token.id) {
    const dbUser = await prisma.user.findUnique({
      where: { id: token.id as string },
    })

    if (dbUser) {
      token.username = dbUser.username
      token.onboarded = dbUser.onboarded
      token.timeZone = dbUser.timeZone
    }
  }

  return token
},

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.username = (token as any).username ?? null
        session.user.onboarded = (token as any).onboarded ?? false
        session.user.timeZone =
          (token as any).timeZone ?? "America/Sao_Paulo"
      }
      return session
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