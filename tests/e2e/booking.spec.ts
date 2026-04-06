import { test, expect } from "./fixtures"

test.describe("Fluxo do Cliente (Agendamento Público)", () => {
  test("Consegue realizar um agendamento com sucesso", async ({ page, loggedInOwner }) => {
    // 1. Navegar para a URL pública do evento
    await page.goto(`/${loggedInOwner.username}/vendas-e2e`)

    // Verifica se a página carregou com o título do evento
    await expect(page.locator("h1", { hasText: "Reunião de Vendas E2E" })).toBeVisible()

    // 2. Selecionar uma data disponível (simulada)
    // O DatePicker usa botões para os dias. Vamos clicar no primeiro dia disponível que não esteja desabilitado.
    // Procura por um botão de dia (gridcell) que não tenha o atributo disabled.
    const availableDay = page.locator("button[name='day']:not([disabled])").first()
    
    // Se não houver name="day", vamos tentar de outra forma. 
    // O calendário do react-day-picker geralmente usa botões com role="gridcell" ou "button"
    // Vamos procurar por um botão que tenha um número (dia) e não esteja desabilitado.
    const dayButton = page.locator("button.rdp-button_reset.rdp-button:not([disabled])").first()
    await dayButton.click({ force: true }) // Force just in case

    // 3. Selecionar um horário
    // Os horários geralmente são botões listados na coluna direita
    const timeSlotButton = page.locator("button", { hasText: ":" }).first()
    await expect(timeSlotButton).toBeVisible()
    await timeSlotButton.click()

    // Clicar em "Avançar" se houver, ou a tela já vai pro form. 
    // Olhando o shell: onSelectSlot faz setSelectedSlot e setStep("form")
    // Mas no shell o TimeSlotPicker recebe a função. Vamos supor que clicar no horário já mude a tela.
    
    // 4. Preencher o formulário
    await expect(page.locator("text=Seus Dados")).toBeVisible()
    
    await page.fill("input[name='guestName']", "Cliente de Teste E2E")
    await page.fill("input[name='guestEmail']", "cliente.e2e@example.com")
    
    // 5. Submeter
    const submitButton = page.locator("button[type='submit']")
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // 6. Verificar o redirecionamento para a página de sucesso
    await expect(page).toHaveURL(/\/booking\/.+/)
    await expect(page.locator("text=Agendamento Confirmado")).toBeVisible()
  })
})