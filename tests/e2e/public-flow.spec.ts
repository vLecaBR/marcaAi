import { test, expect } from "@playwright/test"

test.describe("Jornada Pública e Navegação", () => {
  test("Landing page carrega com sucesso e possui CTA principal", async ({ page }) => {
    await page.goto("/")
    
    // Verifica se a landing page do MarcaAí carregou corretamente
    await expect(page).toHaveTitle(/Marca AI/)
    
    // Procura por um botão ou link que leva ao login
    const loginLink = page.locator('a[href="/login"]')
    await expect(loginLink.first()).toBeVisible()
  })

  test("Página de Login exibe aviso de segurança de Termos de Uso", async ({ page }) => {
    await page.goto("/login")

    // O texto de consentimento deve estar lá
    await expect(page.locator("text=Termos de Uso")).toBeVisible()
    await expect(page.locator("text=Política de Privacidade")).toBeVisible()
  })
})
