/**
 * Acessibilidade (axe-core) das telas que o paciente e o profissional mais usam. Falha com violações `serious` ou
 * `critical` (WCAG 2.1 A/AA). Violações menores ficam no relatório do teste, sem derrubar o build.
 */
import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

async function varre(page: Page, rotulo: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  const resumo = graves.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} elemento(s), ex.: ${v.nodes[0]?.target.join(" ")}`)
  expect(resumo, `${rotulo}: violações graves de acessibilidade`).toEqual([])
}

/** `goto` tolerante a Fast Refresh/compilação do `next dev` (ERR_ABORTED). */
async function vai(page: Page, url: string) {
  await expect(async () => {
    await page.goto(url)
    await page.waitForLoadState("networkidle")
  }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] })
}

test.describe("Acessibilidade", () => {
  test("landing", async ({ page }) => {
    await vai(page, "/")
    await varre(page, "landing")
  })

  test("login", async ({ page }) => {
    await vai(page, "/login")
    await varre(page, "login")
  })

  test("privacidade e termos", async ({ page }) => {
    await vai(page, "/privacidade")
    await varre(page, "privacidade")
    await vai(page, "/termos")
    await varre(page, "termos")
  })

  test("página 404", async ({ page }) => {
    await vai(page, "/essa-rota-nao-existe/muito-menos-esta")
    await varre(page, "404")
  })
})
