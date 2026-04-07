import { test, expect } from "./fixtures"
import { prisma } from "@/lib/prisma"
import { addDays, startOfDay, addHours } from "date-fns"

test.describe("Fluxo do Dono (Dashboard)", () => {
  test("Consegue visualizar e cancelar um agendamento", async ({ page, loggedInOwner }) => {
    // 1. Criar um agendamento falso para o dono no banco de dados
    const eventType = await prisma.eventType.findFirst({
      where: { userId: loggedInOwner.id }
    })

    if (!eventType) {
      throw new Error("EventType not found for loggedInOwner")
    }

    const tomorrow = addDays(startOfDay(new Date()), 1)
    const startTime = addHours(tomorrow, 10) // Amanhã às 10h
    const endTime = addHours(tomorrow, 10.5)

    const booking = await prisma.booking.create({
      data: {
        userId: loggedInOwner.id,
        eventTypeId: eventType.id,
        guestName: "João da Silva",
        guestEmail: "joao@example.com",
        startTime,
        endTime,
        guestTimeZone: "America/Sao_Paulo",
        status: "CONFIRMED",
      }
    })

    // 2. Acessar /dashboard/bookings
    await page.goto("/dashboard/bookings")

    // Verifica se a página carregou e exibe os agendamentos
    await expect(page.locator("h1", { hasText: "Agendamentos" })).toBeVisible()

    // 3. Visualizar o agendamento recém-criado
    const bookingCard = page.locator("div").filter({ has: page.getByTitle(booking.guestName, { exact: true }) }).first()
    await expect(bookingCard).toBeVisible({ timeout: 10000 })

    const cancelOption = bookingCard.locator("button", { hasText: "Cancelar" }).first()

    page.once("dialog", async (dialog) => {
      await dialog.accept("Imprevisto de teste")
    })

    await cancelOption.click()

    // 4. Verificar se a UI reflete o status "Cancelado"
    // Pode aparecer uma badge escrita "Cancelado"
    await expect(page.locator("text=Cancelado").first()).toBeVisible()
    
    // Validar no banco também
    const cancelledBooking = await prisma.booking.findUnique({
      where: { id: booking.id }
    })
    
    expect(cancelledBooking?.status).toBe("CANCELLED")
  })
})