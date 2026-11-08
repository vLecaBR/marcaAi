/**
 * Camada de servidor do front (V2): ponte das Server Actions, sessão, guardas de rota, billing em RSC e
 * retenção de intenção de plano. Tudo com a API mockada — o que se prova aqui é o comportamento de borda
 * (erro → mensagem, 401 → redireciona, falha → degrada).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/problem-details"

vi.mock("server-only", () => ({}))

const serverApiFetch = vi.fn()
const rawApiFetch = vi.fn()
vi.mock("@/lib/api/http-client", () => ({
  serverApiFetch: (...a: unknown[]) => serverApiFetch(...a),
  rawApiFetch: (...a: unknown[]) => rawApiFetch(...a),
}))

// redirect/notFound reais lançam (interrompem a renderização): reproduz isso para testar os guardas.
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND")
})
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), notFound: () => notFound() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  serverApiFetch.mockReset()
  rawApiFetch.mockReset()
  redirect.mockClear()
  notFound.mockClear()
})

describe("apiAction / callApi — mensagens por tipo de erro", () => {
  it("sucesso devolve { success, data }", async () => {
    const { apiAction } = await import("@/lib/api/action-helpers")
    expect(await apiAction(async () => 42)).toEqual({ success: true, data: 42 })
  })

  it.each([
    [new ApiError(401, {}), /sessão expirou/i],
    [new ApiError(403, {}), /permissão/i],
    [new ApiError(404, {}), /não encontrado/i],
    [new ApiError(409, { detail: "Slug já usado" }), /Slug já usado/],
    [new ApiError(409, {}), /Conflito/],
    [new ApiError(422, { detail: "Preço inválido" }), /Preço inválido/],
    [new ApiError(422, {}), /Dados inválidos/],
    [new ApiError(500, { detail: "Falha interna" }), /Falha interna/],
    [new ApiError(500, {}), /Mensagem padrão/],
  ])("erro %# vira mensagem amigável", async (err, esperado) => {
    const { apiAction } = await import("@/lib/api/action-helpers")
    const r = await apiAction(async () => { throw err }, "Mensagem padrão")
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(esperado)
  })

  it("erro que não é da API é relançado (bug de verdade não pode ser engolido)", async () => {
    const { apiAction } = await import("@/lib/api/action-helpers")
    await expect(apiAction(async () => { throw new TypeError("bug") })).rejects.toThrow("bug")
  })

  it("callApi usa o serverApiFetch", async () => {
    serverApiFetch.mockResolvedValue({ ok: true })
    const { callApi } = await import("@/lib/api/action-helpers")
    expect(await callApi("/x", { method: "GET" })).toEqual({ success: true, data: { ok: true } })
    expect(serverApiFetch).toHaveBeenCalledWith("/x", { method: "GET" })
  })
})

describe("getMe / refreshSession", () => {
  it("devolve o usuário", async () => {
    serverApiFetch.mockResolvedValue({ id: "u1" })
    const { getMe } = await import("@/lib/api/session")
    expect(await getMe()).toEqual({ id: "u1" })
  })

  it.each([new ApiError(401, {}), ApiError.network(new Error("x")), new ApiError(503, {})])(
    "sem sessão ou API fora do ar (%#) degrada para null",
    async (err) => {
      serverApiFetch.mockRejectedValue(err)
      const { getMe } = await import("@/lib/api/session")
      expect(await getMe()).toBeNull()
    },
  )

  it("erro inesperado é relançado", async () => {
    serverApiFetch.mockRejectedValue(new ApiError(422, {}))
    const { getMe } = await import("@/lib/api/session")
    await expect(getMe()).rejects.toBeInstanceOf(ApiError)
  })

  it("refreshSession devolve o usuário e os cookies rotacionados; 401 → null", async () => {
    const { refreshSession } = await import("@/lib/api/session")
    rawApiFetch.mockResolvedValueOnce({ data: { id: "u1" }, setCookies: ["a=1"] })
    expect(await refreshSession("marcaai_rt=x")).toEqual({ me: { id: "u1" }, setCookies: ["a=1"] })
    rawApiFetch.mockRejectedValueOnce(new ApiError(401, {}))
    expect(await refreshSession("marcaai_rt=x")).toBeNull()
    rawApiFetch.mockRejectedValueOnce(new ApiError(500, {}))
    await expect(refreshSession("marcaai_rt=x")).rejects.toBeInstanceOf(ApiError)
  })
})

describe("guardas de rota", () => {
  it("requireUser: sem sessão → /login", async () => {
    serverApiFetch.mockRejectedValue(new ApiError(401, {}))
    const { requireUser } = await import("@/lib/auth/guards")
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login")
  })

  it("requireOnboarded: logado sem onboarding → /onboarding; completo passa", async () => {
    const { requireOnboarded } = await import("@/lib/auth/guards")
    serverApiFetch.mockResolvedValueOnce({ id: "u1", onboarded: false })
    await expect(requireOnboarded()).rejects.toThrow("REDIRECT:/onboarding")
    serverApiFetch.mockResolvedValueOnce({ id: "u1", onboarded: true })
    expect(await requireOnboarded()).toMatchObject({ id: "u1" })
  })

  it("requireTeamAccess: 401 → login; 403/404 → notFound; papel insuficiente → notFound; ok devolve a equipe", async () => {
    const { requireTeamAccess } = await import("@/lib/auth/guards")
    const logado = { id: "u1", onboarded: true }

    serverApiFetch.mockResolvedValueOnce(logado).mockRejectedValueOnce(new ApiError(401, {}))
    await expect(requireTeamAccess("t1")).rejects.toThrow("REDIRECT:/login")

    serverApiFetch.mockResolvedValueOnce(logado).mockRejectedValueOnce(new ApiError(403, {}))
    await expect(requireTeamAccess("t1")).rejects.toThrow("NOT_FOUND")

    serverApiFetch.mockResolvedValueOnce(logado).mockRejectedValueOnce(new ApiError(404, {}))
    await expect(requireTeamAccess("t1")).rejects.toThrow("NOT_FOUND")

    serverApiFetch.mockResolvedValueOnce(logado).mockResolvedValueOnce({ id: "t1", role: "MEMBER" })
    await expect(requireTeamAccess("t1")).rejects.toThrow("NOT_FOUND")

    serverApiFetch.mockResolvedValueOnce(logado).mockResolvedValueOnce({ id: "t1", role: "MANAGER" })
    await expect(requireTeamAccess("t1", "owner")).rejects.toThrow("NOT_FOUND")

    serverApiFetch.mockResolvedValueOnce(logado).mockResolvedValueOnce({ id: "t1", role: "OWNER" })
    expect(await requireTeamAccess("t1", "owner")).toMatchObject({ id: "t1" })

    serverApiFetch.mockResolvedValueOnce(logado).mockRejectedValueOnce(new ApiError(500, {}))
    await expect(requireTeamAccess("t1")).rejects.toBeInstanceOf(ApiError)
  })
})

describe("billing em RSC", () => {
  const completo = {
    teamId: "t1", planCode: "CLINICA", status: "ACTIVE", active: true, currentPeriodEnd: null,
    trial: { isTrialing: false, trialEndsAt: null, daysRemaining: null },
    usage: { bookingsThisMonth: 1, membersCount: 1, eventTypesCount: 1 },
    limits: { maxBookingsPerMonth: null, maxMembers: 5, maxEventTypes: null },
  }

  it("contrato completo é usado; incompleto ou erro cai no Solo neutro (sem premium por engano)", async () => {
    const { getTeamBilling, getUserBilling } = await import("@/lib/api/billing")

    serverApiFetch.mockResolvedValueOnce(completo)
    expect((await getTeamBilling("t1")).billing.planCode).toBe("CLINICA")

    serverApiFetch.mockResolvedValueOnce({ planCode: "CLINICA" }) // incompleto
    expect((await getTeamBilling("t1")).billing).toMatchObject({ planCode: "SOLO", active: false })

    serverApiFetch.mockRejectedValueOnce(new ApiError(401, {}))
    expect((await getTeamBilling("t1")).billing.planCode).toBe("SOLO")
    serverApiFetch.mockRejectedValueOnce(new ApiError(500, {}))
    expect((await getTeamBilling("t1")).billing.planCode).toBe("SOLO")

    serverApiFetch.mockRejectedValueOnce(new Error("rede"))
    expect((await getUserBilling()).billing.trial.isTrialing).toBe(false)
  })

  it("getPrimaryTeamBilling: com clínica usa a clínica; sem clínica usa o individual; erro usa o individual", async () => {
    const { getPrimaryTeamBilling } = await import("@/lib/api/billing")

    serverApiFetch.mockResolvedValueOnce([{ id: "t1" }]).mockResolvedValueOnce(completo)
    expect((await getPrimaryTeamBilling()).billing.planCode).toBe("CLINICA")

    serverApiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce({ ...completo, planCode: "SOLO_PRO" })
    expect((await getPrimaryTeamBilling()).billing.planCode).toBe("SOLO_PRO")

    serverApiFetch.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ ...completo, planCode: "SOLO_PRO" })
    expect((await getPrimaryTeamBilling()).billing.planCode).toBe("SOLO_PRO")
  })

  it("requireClinicPlan: plano individual é mandado para /dashboard", async () => {
    const { requireClinicPlan } = await import("@/lib/auth/guards")
    serverApiFetch
      .mockResolvedValueOnce({ id: "u1", onboarded: true }) // getMe
      .mockResolvedValueOnce([]) // teams
      .mockResolvedValueOnce({ ...completo, planCode: "SOLO" }) // user billing
    await expect(requireClinicPlan()).rejects.toThrow("REDIRECT:/dashboard")

    serverApiFetch
      .mockResolvedValueOnce({ id: "u1", onboarded: true })
      .mockResolvedValueOnce([{ id: "t1" }])
      .mockResolvedValueOnce(completo)
    await expect(requireClinicPlan()).resolves.toBeUndefined()
  })
})

describe("intenção de plano retida (cookie → ?plan → localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.cookie = "mai_plan=; Path=/; Max-Age=0"
    window.history.replaceState({}, "", "/")
  })

  it("só retém planos pagos válidos", async () => {
    const m = await import("@/lib/billing/plan-intent")
    expect(m.isValidPaidPlan("SOLO_PRO")).toBe(true)
    expect(m.isValidPaidPlan("SOLO")).toBe(false)
    expect(m.isValidPaidPlan("XYZ")).toBe(false)
    expect(m.isValidPaidPlan(null)).toBe(false)
    m.savePlanIntent("SOLO")
    expect(m.readPlanIntent()).toBeNull()
  })

  it("localStorage: salva, lê e limpa", async () => {
    const m = await import("@/lib/billing/plan-intent")
    m.savePlanIntent("CLINICA")
    expect(m.readPlanIntent()).toBe("CLINICA")
    m.clearPlanIntent()
    expect(m.readPlanIntent()).toBeNull()
  })

  it("cookie: salva, lê e limpa", async () => {
    const m = await import("@/lib/billing/plan-intent")
    m.savePlanIntentCookie("SOLO_PRO")
    expect(m.readPlanIntentCookie()).toBe("SOLO_PRO")
    m.clearPlanIntentCookie()
    expect(m.readPlanIntentCookie()).toBeNull()
  })

  it("resolvePlanIntent respeita a ordem cookie → querystring → localStorage", async () => {
    const m = await import("@/lib/billing/plan-intent")
    m.savePlanIntent("CLINICA")
    expect(m.resolvePlanIntent()).toBe("CLINICA") // só localStorage

    window.history.replaceState({}, "", "/login?plan=CLINICA_PRO")
    expect(m.resolvePlanIntent()).toBe("CLINICA_PRO") // query vence o storage

    m.savePlanIntentCookie("SOLO_PRO")
    expect(m.resolvePlanIntent()).toBe("SOLO_PRO") // cookie vence tudo

    m.clearPlanIntentAll()
    window.history.replaceState({}, "", "/")
    expect(m.resolvePlanIntent()).toBeNull()
  })

  it("savePlanIntentAll grava nos dois e a trilha vem do plano", async () => {
    const m = await import("@/lib/billing/plan-intent")
    m.savePlanIntentAll("CLINICA")
    expect(m.readPlanIntentCookie()).toBe("CLINICA")
    expect(m.readPlanIntent()).toBe("CLINICA")
    expect(m.planIntentAudience("CLINICA")).toBe("clinic")
    expect(m.planIntentAudience("SOLO_PRO")).toBe("individual")
  })
})
