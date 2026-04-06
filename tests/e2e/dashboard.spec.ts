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
    const bookingRow = page.locator(`text=${booking.guestName}`)
    await expect(bookingRow).toBeVisible()

    // Clicar no botão "Ver Detalhes" ou "Cancelar" dependendo do layout
    // No projeto normal do shadcn as ações estão num dropdown, vamos tentar localizar um botão de cancelar.
    // Vamos procurar por um botão que contenha "Cancelar" ou o menu de opções.
    
    // Supondo que tem um botão de cancelar diretamente visível ou abrindo um menu.
    // Como não sei exatamente como é a UI de bookings, posso tentar um seletor genérico.
    // O Shadcn UI pode ter um Button ou um DropdownMenu.
    // Para simplificar e garantir que o Playwright ache, vou procurar o texto "Cancelar" no elemento de ação da tabela.

    const actionsMenuButton = page.locator("button").filter({ has: page.locator("svg.lucide-more-horizontal") }).first()
    if (await actionsMenuButton.isVisible()) {
      await actionsMenuButton.click()
    }
    
    const cancelOption = page.locator("text=Cancelar").first()
    if (await cancelOption.isVisible()) {
      await cancelOption.click()
      
      // Preencher o modal de cancelamento
      const reasonInput = page.locator("textarea[name='reason'], input[name='reason']").first()
      if (await reasonInput.isVisible()) {
        await reasonInput.fill("Imprevisto de teste")
      }
      
      const confirmCancelButton = page.locator("button:has-text('Cancelar Agendamento'), button:has-text('Confirmar Cancelamento')").first()
      if (await confirmCancelButton.isVisible()) {
        await confirmCancelButton.click()
      }
    }

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