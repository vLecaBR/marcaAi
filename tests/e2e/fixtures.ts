import { test as base, Page, BrowserContext } from "@playwright/test"
// @ts-ignore
import { encode } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

// Extender o objeto `test` do Playwright
export const test = base.extend<{
  loggedInUser: any
  loggedInOwner: any
}>({
  loggedInUser: async ({ page, context }: { page: Page, context: BrowserContext }, use: any) => {
    // Cria um usuário no banco para o teste
    const user = await prisma.user.create({
      data: {
        email: `testuser-${randomUUID()}@example.com`,
        name: "Test E2E User",
        username: `teste2euser-${randomUUID()}`,
        onboarded: true,
      },
    })

    // Cria o token JWT pro NextAuth v5
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: null,
        username: user.username,
        onboarded: user.onboarded,
      },
      secret: process.env.AUTH_SECRET || "test-secret-never-use-in-prod",
      salt: "authjs.session-token",
    })

    // Injeta o cookie no contexto do navegador
    await context.addCookies([
      {
        name: "authjs.session-token", // No NextAuth v5 por default é authjs.session-token (se não for HTTPS)
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false, // se estiver rodando local no HTTP
      },
    ])

    await use(user)

    // Cleanup: deletar usuário após o teste
    await prisma.user.delete({ where: { id: user.id } })
  },
  
  loggedInOwner: async ({ page, context }: { page: Page, context: BrowserContext }, use: any) => {
    // Cria um usuário e dados necessários (Schedule, EventType) para o dono da agenda
    const user = await prisma.user.create({
      data: {
        email: `owner-${randomUUID()}@example.com`,
        name: "Test E2E Owner",
        username: `teste2eowner-${randomUUID()}`,
        onboarded: true,
      },
    })

    await prisma.schedule.create({
      data: {
        userId: user.id,
        name: "Agenda E2E",
        timeZone: "America/Sao_Paulo",
        isDefault: true,
        availabilities: {
          create: [0, 1, 2, 3, 4, 5, 6].map(day => ({
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "18:00",
          }))
        }
      }
    })

    await prisma.eventType.create({
      data: {
        userId: user.id,
        title: "Reunião de Vendas E2E",
        slug: "vendas-e2e",
        duration: 30,
        price: 0,
        currency: "BRL",
      }
    })

    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: null,
        username: user.username,
        onboarded: user.onboarded,
      },
      secret: process.env.AUTH_SECRET || "test-secret-never-use-in-prod",
      salt: "authjs.session-token",
    })

    await context.addCookies([
      {
        name: "authjs.session-token", 
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ])

    await use(user)

    await prisma.user.delete({ where: { id: user.id } })
  },
})

export { expect } from "@playwright/test"