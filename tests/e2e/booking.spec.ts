import { test, expect } from "./fixtures"

test.describe("Fluxo do Cliente (Agendamento Público)", () => {
  test("Consegue realizar um agendamento com sucesso", async ({ page, loggedInOwner }) => {
    // 1. Navegar para a URL pública do evento
    await page.goto(`/${loggedInOwner.username}/vendas-e2e`)

    // Verifica se a página carregou com o título do evento
    await expect(page.locator("h1", { hasText: "Reunião de Vendas E2E" })).toBeVisible()

    // 2. Selecionar uma data disponível (simulada)
    // O calendário do marcaAE usa um grid-cols-7 gap-1
    const calendarGrid = page.locator('.grid-cols-7.gap-1').last()
    const dayButton = calendarGrid.locator('button:not([disabled])', { hasText: /^\d+$/ }).first()
    await dayButton.click({ force: true }) // Force just in case

    // 3. Selecionar um horário
    // Os horários geralmente são botões com o formato HH:mm
    const timeSlotButton = page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first()
    await expect(timeSlotButton).toBeVisible()
    await timeSlotButton.click()

    // Clicar em "Avançar" se houver, ou a tela já vai pro form. 
    // Olhando o shell: onSelectSlot faz setSelectedSlot e setStep("form")
    // Mas no shell o TimeSlotPicker recebe a função. Vamos supor que clicar no horário já mude a tela.
    
    // 4. Preencher o formulário
    await expect(page.locator("text=Seus Dados")).toBeVisible()
    
    await page.fill("input[name='name']", "Cliente de Teste E2E")
    await page.fill("input[name='email']", "cliente.e2e@example.com")
    
    // 5. Submeter
    const submitButton = page.locator("button[type='submit']")
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // 6. Verificar a tela de sucesso (sem redirecionamento de URL)
    await expect(page.locator("text=Agendamento Confirmado")).toBeVisible()
  })
})