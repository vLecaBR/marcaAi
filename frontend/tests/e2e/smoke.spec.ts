/**
 * E2E de fumaça contra a stack local (F8). Pré-requisitos:
 *   docker compose -f docker-compose.dev.yml up -d   # Postgres (5433) + Mailpit (SMTP 1025 / API 8025)
 * O Playwright sobe a API (:5080) e o Next (:3000) sozinho (ver playwright.config.ts) ou reaproveita
 * os que já estiverem rodando. O spec cria os próprios dados (e-mail/username aleatórios) — não depende de seed.
 *
 * Fluxo: login por magic link (e-mail lido na API do Mailpit) → onboarding → tipo de consulta →
 * agendamento público ponta a ponta (regressão do achado #1) → detalhe e cancelamento.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025"

/** Espera o e-mail do magic link chegar no Mailpit e devolve o link `/auth/verify?token=...`. */
async function linkDoMagicLink(request: APIRequest, email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const busca = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } })
    const { messages } = (await busca.json()) as { messages: { ID: string }[] }
    if (messages?.length) {
      const msg = await request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)
      const { HTML, Text } = (await msg.json()) as { HTML: string; Text: string }
      const achado = /https?:\/\/[^\s"'<>]+\/auth\/verify\?token=[A-Za-z0-9_-]+/.exec(`${Text}\n${HTML}`)
      if (achado) return achado[0].replace(/&amp;/g, "&")
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Magic link para ${email} não chegou ao Mailpit`)
}
type APIRequest = APIRequestContext

async function escolheDiaEHorario(page: Page) {
  const grade = page.locator(".grid-cols-7").last()
  const dias = grade.locator("button:not([disabled])", { hasText: /^\d{1,2}$/ })
  const horario = page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first()
  await expect(dias.first()).toBeVisible()

  // O calendário habilita todos os dias futuros (inclusive fins de semana sem agenda): percorre até achar um com horários.
  const total = Math.min(await dias.count(), 12)
  for (let i = 0; i < total; i++) {
    await dias.nth(i).click()
    // 1ª visita compila /api/slots no `next dev` e o clique pode vir antes da hidratação: dá mais tempo no 1º dia.
    if (await horario.isVisible({ timeout: i === 0 ? 8_000 : 3_000 }).catch(() => false)) break
    await expect(horario.or(page.getByText("Nenhum horário disponível"))).toBeVisible({ timeout: 8_000 })
    if (await horario.isVisible()) break
  }
  await expect(horario).toBeVisible()
  await horario.click()
}

test.describe("Páginas públicas", () => {
  test("landing, login e páginas legais carregam", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator('a[href="/login"]').first()).toBeVisible()
    await expect(page.locator('a[href="/privacidade"]').first()).toBeVisible()

    await page.goto("/login")
    await expect(page.getByRole("link", { name: /Continuar com Google/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /Enviar link de acesso/ })).toBeVisible()

    await page.goto("/privacidade")
    await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible()
    await expect(page.getByText(/Versão preliminar/)).toBeVisible()
    await page.goto("/termos")
    await expect(page.getByRole("heading", { name: "Termos de uso" })).toBeVisible()
  })

  test("dashboard sem sessão redireciona para o login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Jornada completa", () => {
  test("profissional entra, configura a agenda e o paciente agenda e cancela", async ({ page, browser, request }, testInfo) => {
    test.setTimeout(150_000) // `next dev` compila cada rota na primeira visita
    const sufixo = Date.now().toString(36)
    const email = `e2e-${sufixo}@example.test`
    const username = `dra-e2e-${sufixo}`

    // 1) Login por magic link, pelo front.
    await page.goto("/login")
    // No `next dev` a página pode recarregar (Fast Refresh) ou submeter antes da hidratação: repete até o estado "enviado".
    await expect(async () => {
      await page.getByLabel("E-mail").fill(email)
      await page.getByRole("button", { name: /Enviar link de acesso/ }).click()
      await expect(page.getByText("Verifique seu e-mail")).toBeVisible({ timeout: 4_000 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })

    const link = await linkDoMagicLink(request, email)
    await page.goto(link)
    await expect(page).toHaveURL(/\/(onboarding|dashboard)/)

    // 2) Onboarding e tipo de consulta (pelo BFF, já com a sessão do navegador).
    const perfil = await page.request.put("/api/bff/me/profile", {
      data: {
        name: "Dra. E2E", username, timeZone: "America/Sao_Paulo", bio: null, theme: "LIGHT", brandColor: null,
        specialty: null, council: null, registrationNumber: null, clinicName: null,
      },
    })
    expect(perfil.ok(), await perfil.text()).toBeTruthy()
    const evento = await page.request.post("/api/bff/event-types", {
      data: {
        title: "Consulta E2E", slug: "consulta-e2e", duration: 30, locationType: "IN_PERSON", requiresConfirm: false,
        beforeEventBuffer: 0, afterEventBuffer: 0, bookingLimitDays: 60, locationValue: "Rua Teste, 100", price: null, questions: [],
      },
    })
    expect(evento.ok(), await evento.text()).toBeTruthy()

    // 3) Paciente (contexto limpo, sem sessão) agenda pela página pública.
    const paciente = await browser.newContext()
    const pg = await paciente.newPage()
    await pg.goto(`/${username}/consulta-e2e`)
    await pg.waitForLoadState("networkidle")
    await expect(pg.getByRole("heading", { name: /Consulta E2E/ }).first()).toBeVisible()
    try {
      await escolheDiaEHorario(pg)
    } catch (e) {
      await pg.screenshot({ path: testInfo.outputPath("pagina-do-paciente.png"), fullPage: true })
      throw e
    }

    await pg.getByPlaceholder("Seu nome").fill("Paciente E2E")
    await pg.getByPlaceholder("seu@email.com").fill(`paciente-${sufixo}@example.test`)

    // Consentimento LGPD é obrigatório: sem marcar, o envio é bloqueado.
    await pg.getByRole("button", { name: /Confirmar agendamento/ }).click()
    await expect(pg.getByText("É necessário concordar para agendar.")).toBeVisible()
    await pg.locator('input[type="checkbox"]').check()
    await pg.getByRole("button", { name: /Confirmar agendamento/ }).click()

    await expect(pg.getByText("Agendamento confirmado!")).toBeVisible({ timeout: 15_000 })

    // 4) A consulta aparece para o profissional.
    const lista = await page.request.get("/api/bff/bookings")
    expect(lista.ok()).toBeTruthy()
    const consultas = (await lista.json()) as { guestName: string; uid: string; status: string }[]
    const minha = consultas.find((c) => c.guestName === "Paciente E2E")
    expect(minha).toBeTruthy()

    // 5) Detalhe público por uid e cancelamento (libera o horário).
    await pg.goto(`/booking/${minha!.uid}`)
    await expect(pg.getByText("Paciente E2E").first()).toBeVisible()
    const cancel = await pg.request.post(`/api/bff/bookings/${minha!.uid}/cancel`, { data: { reason: "e2e", canceledBy: "GUEST" } })
    expect(cancel.ok(), await cancel.text()).toBeTruthy()

    await paciente.close()
  })
})
