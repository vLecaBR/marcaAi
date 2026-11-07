import { describe, expect, it } from "vitest"
import {
  BASE_PLAN_CODE,
  PLAN_CONFIG,
  PLAN_ORDER,
  canUseFeature,
  featureInAudience,
  formatFeeBps,
  getPlanAudience,
  getPlanConfig,
  hasPremiumAccess,
  isClinicPlan,
  isIndividualPlan,
  isPaidPlan,
  minPlanForFeature,
  planFeatureLines,
  planHasFeature,
  plansByAudience,
} from "@/lib/plans/plan-config"
import { brandPassesAA, safeBrandColor } from "@/lib/brand-theme"
import { cn, formatBRLCents } from "@/lib/utils"

describe("plan-config", () => {
  it("espelha a escada de taxas do backend (PlanCatalog)", () => {
    expect(PLAN_CONFIG.SOLO.feeBps).toBe(1000)
    expect(PLAN_CONFIG.SOLO_PRO.feeBps).toBe(500)
    expect(PLAN_CONFIG.CLINICA.feeBps).toBe(249)
    expect(PLAN_CONFIG.CLINICA_PRO.feeBps).toBe(199)
  })

  it("plano maior, taxa menor; ordem de exibição coerente", () => {
    const fees = PLAN_ORDER.map((c) => PLAN_CONFIG[c].feeBps)
    expect([...fees].sort((a, b) => b - a)).toEqual(fees)
    expect(PLAN_ORDER.map((c) => PLAN_CONFIG[c].order)).toEqual([0, 1, 2, 3])
  })

  it("limites espelham o backend", () => {
    expect(PLAN_CONFIG.SOLO.limits).toEqual({ maxBookingsPerMonth: 50, maxMembers: 1, maxEventTypes: 3 })
    expect(PLAN_CONFIG.CLINICA.limits.maxMembers).toBe(5)
    expect(PLAN_CONFIG.CLINICA_PRO.limits.maxMembers).toBeNull()
  })

  it("plano desconhecido ou vazio cai no Solo (seguro)", () => {
    expect(getPlanConfig("XPTO").planCode).toBe(BASE_PLAN_CODE)
    expect(getPlanConfig(null).planCode).toBe("SOLO")
    expect(getPlanConfig(undefined).planCode).toBe("SOLO")
  })

  it("isPaidPlan / trilhas", () => {
    expect(isPaidPlan("SOLO")).toBe(false)
    expect(isPaidPlan("SOLO_PRO")).toBe(true)
    expect(isPaidPlan("lixo")).toBe(false)
    expect(isClinicPlan("CLINICA")).toBe(true)
    expect(isClinicPlan("SOLO_PRO")).toBe(false)
    expect(isIndividualPlan("SOLO_PRO")).toBe(true)
    expect(getPlanAudience("CLINICA_PRO")).toBe("clinic")
    expect(plansByAudience("clinic").map((p) => p.planCode)).toEqual(["CLINICA", "CLINICA_PRO"])
    expect(plansByAudience("individual").map((p) => p.planCode)).toEqual(["SOLO", "SOLO_PRO"])
  })

  it("trial NUNCA concede premium ao plano gratuito", () => {
    expect(hasPremiumAccess({ planCode: "SOLO", isTrialing: true })).toBe(false)
    expect(hasPremiumAccess({ planCode: "SOLO_PRO", isTrialing: false })).toBe(true)
  })

  it("feature de clínica não vaza para a trilha individual em trial", () => {
    expect(canUseFeature("team_finance", { planCode: "SOLO_PRO", isTrialing: true })).toBe(false)
    expect(canUseFeature("team_finance", { planCode: "CLINICA", isTrialing: false })).toBe(true)
    expect(canUseFeature("whatsapp_reminders", { planCode: "SOLO", isTrialing: true })).toBe(false)
    expect(canUseFeature("whatsapp_reminders", { planCode: "SOLO_PRO", isTrialing: false })).toBe(true)
    expect(planHasFeature("CLINICA", "advanced_reports")).toBe(false)
    expect(featureInAudience("advanced_reports", "clinic")).toBe(true)
    expect(featureInAudience("advanced_reports", "individual")).toBe(false)
  })

  it("minPlanForFeature aponta o menor plano que inclui a feature", () => {
    expect(minPlanForFeature("whatsapp_reminders")?.planCode).toBe("SOLO_PRO")
    expect(minPlanForFeature("team_finance")?.planCode).toBe("CLINICA")
    expect(minPlanForFeature("advanced_reports")?.planCode).toBe("CLINICA_PRO")
  })

  it("formatFeeBps usa vírgula e duas casas", () => {
    expect(formatFeeBps(1000)).toBe("10,00%")
    expect(formatFeeBps(249)).toBe("2,49%")
    expect(formatFeeBps(199)).toBe("1,99%")
  })

  it("planFeatureLines deriva a copy do config", () => {
    const solo = planFeatureLines(PLAN_CONFIG.SOLO)
    expect(solo).toContain("50 agendamentos por mês")
    expect(solo).toContain("1 profissional")
    expect(solo).toContain("3 tipos de consulta")
    expect(solo).toContain("Taxa de 10,00% por consulta")
    const pro = planFeatureLines(PLAN_CONFIG.CLINICA_PRO)
    expect(pro).toContain("Agendamentos ilimitados")
    expect(pro).toContain("Profissionais ilimitados")
  })
})

describe("brand-theme (contraste WCAG AA)", () => {
  it("cor escura passa e é normalizada", () => {
    expect(safeBrandColor("#1E3A8A")).toBe("#1e3a8a")
    expect(brandPassesAA("#1e3a8a")).toBe(true)
  })

  it("cor clara demais cai no Teal institucional", () => {
    expect(safeBrandColor("#ffff00")).toBe("#0f9e8e")
    expect(brandPassesAA("#ffffff")).toBe(false)
  })

  it("entrada inválida ou vazia cai no Teal", () => {
    for (const v of [null, undefined, "", "azul", "#12", "#gggggg"]) expect(safeBrandColor(v)).toBe("#0f9e8e")
    expect(brandPassesAA(null)).toBe(false)
  })

  it("aceita hex sem # e com espaços", () => {
    expect(safeBrandColor(" 1e3a8a ")).toBe("#1e3a8a")
  })
})

describe("utils", () => {
  it("formatBRLCents formata centavos em reais pt-BR", () => {
    const norm = (s: string) => s.replace(/ /g, " ")
    expect(norm(formatBRLCents(128400))).toBe("R$ 1.284,00")
    expect(norm(formatBRLCents(0))).toBe("R$ 0,00")
    expect(norm(formatBRLCents(5))).toBe("R$ 0,05")
    expect(norm(formatBRLCents(4900))).toBe("R$ 49,00")
  })

  it("cn mescla classes e resolve conflitos do Tailwind", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })
})
