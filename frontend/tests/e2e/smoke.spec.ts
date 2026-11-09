/**
 * E2E de fumaça contra a stack local (F8). Pré-requisitos:
 *   docker compose -f docker-compose.dev.yml up -d   # Postgres (5433) + Mailpit (SMTP 1025 / API 8025)
 * O Playwright sobe a API (:5080) e o Next (:3000) sozinho (ver playwright.config.ts) ou reaproveita
 * os que já estiverem rodando. O spec cria os próprios dados (e-mail/username aleatórios) — não depende de seed.
 *
 * Fluxo: login por magic link (e-mail lido na API do Mailpit) → onboarding → tipo de consulta →
 * agendamento público ponta a ponta (regressão do achado #1) → detalhe e cancelamento.
 */
import AxeBuilder from "@axe-core/playwright"
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

/** `pulaDias`: começa a procurar a partir do N-ésimo dia habilitado (evita horários a menos de 24h, que o paciente não remarca). */
async function escolheDiaEHorario(page: Page, pulaDias = 0) {
  const grade = page.locator(".grid-cols-7").last()
  const dias = grade.locator("button:not([disabled])", { hasText: /^\d{1,2}$/ })
  const horario = page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first()
  await expect(dias.first()).toBeVisible()

  // O calendário habilita todos os dias futuros (inclusive fins de semana sem agenda): percorre até achar um com horários.
  const total = Math.min(await dias.count(), 12)
  for (let i = pulaDias; i < total; i++) {
    // O clique antes da hidratação (next dev) não faz nada: repete até o painel de horários abrir.
    await expect(async () => {
      await dias.nth(i).click()
      await expect(page.getByText(/Selecione uma data/)).toBeHidden({ timeout: 2_500 })
    }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })
    await expect(horario.or(page.getByText("Nenhum horário disponível"))).toBeVisible({ timeout: 20_000 })
    if (await horario.isVisible()) break
  }
  await expect(horario).toBeVisible()
  await horario.click()
}

/** Login por magic link (e-mail lido no Mailpit) + onboarding mínimo; devolve o username criado. */
async function entraEConfigura(page: Page, request: APIRequest, sufixo: string, nome: string): Promise<string> {
  const email = `e2e-${sufixo}@example.test`
  const username = `dra-${sufixo}`
  await page.goto("/login")
  await expect(async () => {
    if (await page.getByText("Verifique seu e-mail").isVisible()) return // o envio anterior demorou, mas deu certo
    await page.getByLabel("E-mail").fill(email)
    await page.getByRole("button", { name: /Enviar link de acesso/ }).click()
    await expect(page.getByText("Verifique seu e-mail")).toBeVisible({ timeout: 10_000 })
  }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] })
  await page.goto(await linkDoMagicLink(request, email))
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/)
  const perfil = await page.request.put("/api/bff/me/profile", {
    data: {
      name: nome, username, timeZone: "America/Sao_Paulo", bio: null, theme: "LIGHT", brandColor: null,
      specialty: null, council: null, registrationNumber: null, clinicName: null,
    },
  })
  expect(perfil.ok(), await perfil.text()).toBeTruthy()
  const fim = await page.request.post("/api/bff/me/onboarding/complete")
  expect(fim.ok(), await fim.text()).toBeTruthy()
  // O flag `onboarded` vem no token da sessão: o wizard rotaciona o token em seguida; o teste faz o mesmo.
  expect((await page.request.post("/api/auth/refresh")).ok()).toBeTruthy()
  return username
}

/** Falha se a tela tiver violação grave/crítica de acessibilidade (WCAG 2.1 A/AA, axe-core). */
async function acessivel(pg: Page, rotulo: string) {
  // Mede o estado ASSENTADO: botões com `transition` (ex.: dias do calendário que habilitam quando a lista do mês chega) passam por
  // cores intermediárias durante ~150 ms e o axe, medindo nesse intervalo, acusa contraste que o usuário nunca vê. Espera as
  // animações/transições FINITAS terminarem (as infinitas, como o spinner, são ignoradas). A regra em si não muda.
  await pg.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await Promise.all(
      document.getAnimations()
        .filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    )
  })
  const r = await new AxeBuilder({ page: pg }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const graves = r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} (ex.: ${v.nodes[0]?.target.join(" ")})`)
  expect(graves, `${rotulo}: acessibilidade`).toEqual([])
}

/** `goto` tolerante a Fast Refresh/compilação do `next dev`, que às vezes aborta a navegação (ERR_ABORTED). */
async function vai(pg: Page, url: string) {
  await expect(async () => {
    await pg.goto(url)
  }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })
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
      if (await page.getByText("Verifique seu e-mail").isVisible()) return // o envio anterior demorou, mas deu certo
      await page.getByLabel("E-mail").fill(email)
      await page.getByRole("button", { name: /Enviar link de acesso/ }).click()
      await expect(page.getByText("Verifique seu e-mail")).toBeVisible({ timeout: 10_000 })
    }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] })

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
    const consultas = ((await lista.json()) as { items: { guestName: string; uid: string; status: string }[] }).items
    const minha = consultas.find((c) => c.guestName === "Paciente E2E")
    expect(minha).toBeTruthy()

    // 5) Detalhe público por uid e cancelamento (libera o horário).
    // No `next dev` a 1ª visita compila a rota e um Fast Refresh pode abortar a navegação: repete.
    await expect(async () => {
      await pg.goto(`/booking/${minha!.uid}`)
      await expect(pg.getByText("Paciente E2E").first()).toBeVisible({ timeout: 8_000 })
    }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] })
    const cancel = await pg.request.post(`/api/bff/bookings/${minha!.uid}/cancel`, { data: { reason: "e2e", canceledBy: "GUEST" } })
    expect(cancel.ok(), await cancel.text()).toBeTruthy()

    await paciente.close()
  })
})

test.describe("Jornada paga, remarcação e pacientes (pagamento simulado)", () => {
  test("paciente reserva, paga, confirma, remarca; profissional vê o paciente", async ({ page, browser, request }, testInfo) => {
    test.setTimeout(240_000)
    const sufixo = "p" + Date.now().toString(36)
    const username = await entraEConfigura(page, request, sufixo, "Dra. Paga E2E")

    // Sem recebimentos ativos, não dá para criar serviço pago online (regra D14)…
    const corpo = {
      title: "Sessão paga", slug: "sessao-paga", duration: 30, locationType: "IN_PERSON", requiresConfirm: false,
      beforeEventBuffer: 0, afterEventBuffer: 0, bookingLimitDays: 60, locationValue: "Rua Teste, 100", price: 15000, payOnSite: false, questions: [],
    }
    const bloqueado = await page.request.post("/api/bff/event-types", { data: corpo })
    expect(bloqueado.status()).toBe(422)

    // …ativa os recebimentos simulados e cria.
    const ativa = await page.request.post("/api/bff/dev/payouts/activate")
    expect(ativa.ok(), await ativa.text()).toBeTruthy()
    const criado = await page.request.post("/api/bff/event-types", { data: corpo })
    expect(criado.ok(), await criado.text()).toBeTruthy()

    // Paciente agenda e é levado ao checkout, com o horário reservado.
    const paciente = await browser.newContext()
    const pg = await paciente.newPage()
    await vai(pg, `/${username}/sessao-paga`)
    await pg.waitForLoadState("networkidle")
    await acessivel(pg, "página pública do serviço")
    try {
      await escolheDiaEHorario(pg, 3)
    } catch (e) {
      await pg.screenshot({ path: testInfo.outputPath("paciente-paga.png"), fullPage: true })
      throw e
    }
    await pg.getByPlaceholder("Seu nome").fill("Paciente Pago E2E")
    await pg.getByPlaceholder("seu@email.com").fill(`pago-${sufixo}@example.test`)
    await pg.locator('input[type="checkbox"]').check()
    await pg.getByRole("button", { name: /Confirmar agendamento/ }).click()

    await expect(pg).toHaveURL(/\/booking\/[^/]+\/pay/, { timeout: 20_000 })
    const uid = pg.url().split("/booking/")[1].split("/")[0]
    await expect(pg.getByText(/Horário reservado por mais/)).toBeVisible()
    await acessivel(pg, "pagamento")
    await expect(pg.getByText("R$ 150,00").first()).toBeVisible()

    // Antes de pagar, a consulta aparece como aguardando pagamento.
    await vai(pg, `/booking/${uid}`)
    await expect(pg.getByRole("heading", { name: "Aguardando pagamento" })).toBeVisible()

    // Paga (simulado) → confirmada.
    await vai(pg, `/booking/${uid}/pay`)
    await pg.getByRole("button", { name: /Cartão de crédito/ }).click()
    await pg.getByTestId("fake-pay").click()
    await expect(pg).toHaveURL(new RegExp(`/booking/${uid}$`), { timeout: 30_000 })
    await expect(pg.getByRole("heading", { name: "Confirmado" })).toBeVisible()
    await acessivel(pg, "consulta confirmada")
    await expect(pg.getByText(/pago$/).first()).toBeVisible()

    // Remarca (outro dia, com 24h+ de antecedência).
    await pg.getByRole("link", { name: "Remarcar" }).click()
    await expect(pg.getByRole("heading", { name: "Remarcar consulta" })).toBeVisible()
    await acessivel(pg, "remarcar")
    const horarioAntes = await pg.locator("b").first().textContent()
    const grade = pg.locator(".grid-cols-7").last()
    const dias = grade.locator("button:not([disabled])", { hasText: /^\d{1,2}$/ })
    const horario = pg.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first()
    await expect(dias.first()).toBeVisible()
    const total = Math.min(await dias.count(), 14)
    for (let i = total - 1; i >= 0; i--) { // dias mais distantes primeiro: garante > 24h
      // O clique antes da hidratação (next dev) não faz nada: repete até o painel de horários abrir.
      await expect(async () => {
        await dias.nth(i).click()
        await expect(pg.getByText("Selecione uma data.")).toBeHidden({ timeout: 2_500 })
      }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })
      await expect(horario.or(pg.getByText("Nenhum horário disponível"))).toBeVisible({ timeout: 20_000 })
      if (await horario.isVisible()) break
    }
    await expect(horario).toBeVisible()
    await horario.click()
    await pg.getByTestId("confirm-reschedule").click()
    await expect(pg).toHaveURL(new RegExp(`/booking/${uid}\\?remarcada=1`), { timeout: 20_000 })
    await expect(pg.getByText(/remarcada com sucesso/)).toBeVisible()
    expect(horarioAntes).toBeTruthy()

    // O profissional enxerga o paciente (lista e busca).
    const lista = await page.request.get("/api/bff/patients?q=Pago")
    expect(lista.ok()).toBeTruthy()
    const pacientes = ((await lista.json()) as { items: { name: string; totalBookings: number; totalPaidCents: number }[] }).items
    expect(pacientes.some((p) => p.name === "Paciente Pago E2E" && p.totalPaidCents === 15000)).toBeTruthy()
    await vai(page, "/dashboard/patients")
    await expect(page.getByText("Paciente Pago E2E")).toBeVisible({ timeout: 30_000 })
    await acessivel(page, "lista de pacientes")

    await paciente.close()
  })
})
