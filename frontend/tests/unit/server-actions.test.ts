/**
 * Server Actions (proxies finos da API .NET): validam a entrada ANTES de chamar a API, mandam o corpo certo para o
 * endpoint certo e traduzem os erros. Cobre também as ações de LGPD (exportar/anonimizar/excluir).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/problem-details"

vi.mock("server-only", () => ({}))
const serverApiFetch = vi.fn()
vi.mock("@/lib/api/http-client", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a), rawApiFetch: vi.fn() }))
const revalidatePath = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

beforeEach(() => {
  serverApiFetch.mockReset()
  revalidatePath.mockReset()
})

const CUID = "cmw6u3g0400024054hfggzhum"

describe("tipos de consulta", () => {
  const base = { title: "Consulta", slug: "consulta", duration: 30, color: "TEAL", locationType: "IN_PERSON", locationValue: "Rua X, 1", isActive: true, requiresConfirm: false }

  it("cria: arredonda o preço para centavos inteiros, envia payOnSite e revalida a lista", async () => {
    serverApiFetch.mockResolvedValue({ id: CUID, slug: "consulta" })
    const { upsertEventTypeAction } = await import("@/lib/actions/event-types")
    const r = await upsertEventTypeAction({ ...base, price: 1510.0000000002, payOnSite: true } as never)

    expect(r).toEqual({ success: true, data: { id: CUID, slug: "consulta" } })
    const [path, init] = serverApiFetch.mock.calls[0]
    expect(path).toBe("/event-types")
    expect(init.method).toBe("POST")
    expect(init.body).toMatchObject({ price: 1510, payOnSite: true, currency: "BRL", locationValue: "Rua X, 1" })
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/event-types")
  })

  it("edita com PUT no id; sem preço manda null", async () => {
    serverApiFetch.mockResolvedValue(undefined)
    const { upsertEventTypeAction } = await import("@/lib/actions/event-types")
    const r = await upsertEventTypeAction({ ...base, id: CUID, price: null } as never)

    expect(r.success).toBe(true)
    const [path, init] = serverApiFetch.mock.calls[0]
    expect(path).toBe(`/event-types/${CUID}`)
    expect(init.method).toBe("PUT")
    expect(init.body.price).toBeNull()
  })

  it("dado inválido não chega na API", async () => {
    const { upsertEventTypeAction } = await import("@/lib/actions/event-types")
    const r = await upsertEventTypeAction({ ...base, slug: "Slug Inválido!" } as never)
    expect(r.success).toBe(false)
    expect(serverApiFetch).not.toHaveBeenCalled()
  })

  it("422 da API (preço sem recebimento) volta como mensagem para a tela e não revalida", async () => {
    serverApiFetch.mockRejectedValue(new ApiError(422, { detail: "Para cobrar online, ative seus recebimentos." }))
    const { upsertEventTypeAction } = await import("@/lib/actions/event-types")
    const r = await upsertEventTypeAction({ ...base, price: 15000 } as never)
    expect(r).toEqual({ success: false, error: "Para cobrar online, ative seus recebimentos." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("lista, ativa/desativa e exclui", async () => {
    const a = await import("@/lib/actions/event-types")
    serverApiFetch.mockResolvedValueOnce([{ id: "1" }])
    expect(await a.getEventTypesAction()).toEqual({ success: true, data: [{ id: "1" }] })

    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await a.toggleEventTypeAction("e1", false)).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/event-types/e1/status", { method: "PATCH", body: { isActive: false } })

    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await a.deleteEventTypeAction("e1")).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/event-types/e1", { method: "DELETE" })

    serverApiFetch.mockRejectedValueOnce(new ApiError(403, {}))
    expect((await a.deleteEventTypeAction("e1")).success).toBe(false)
  })
})

describe("disponibilidade e bloqueios", () => {
  it("achata só os dias habilitados com intervalos", async () => {
    serverApiFetch.mockResolvedValue(undefined)
    const { saveAvailabilityAction } = await import("@/lib/actions/availability")
    const r = await saveAvailabilityAction({
      scheduleId: CUID, timeZone: "America/Sao_Paulo",
      availabilities: [
        { dayOfWeek: 1, enabled: true, intervals: [{ startTime: "09:00", endTime: "12:00" }, { startTime: "14:00", endTime: "18:00" }] },
        { dayOfWeek: 2, enabled: false, intervals: [{ startTime: "09:00", endTime: "18:00" }] },
        { dayOfWeek: 3, enabled: true, intervals: [] },
      ],
    } as never)

    expect(r.success).toBe(true)
    const [path, init] = serverApiFetch.mock.calls[0]
    expect(path).toBe(`/schedules/${CUID}/availability`)
    expect(init.body.availabilities).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00" },
    ])
    expect(revalidatePath).toHaveBeenCalledWith("/settings/availability")
  })

  it("bloqueios: valida a data, cria e remove", async () => {
    const a = await import("@/lib/actions/exceptions")
    expect((await a.addExceptionAction({ scheduleId: "s1", date: "07/11/2026", type: "BLOCKED" } as never)).success).toBe(false)
    expect(serverApiFetch).not.toHaveBeenCalled()

    serverApiFetch.mockResolvedValue(undefined)
    expect((await a.addExceptionAction({ scheduleId: "s1", date: "2026-12-25", type: "VACATION", reason: "Natal" })).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/schedules/s1/exceptions", {
      method: "POST", body: { date: "2026-12-25", type: "VACATION", startTime: null, endTime: null, reason: "Natal" },
    })
    expect((await a.removeExceptionAction("x1")).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/exceptions/x1", { method: "DELETE" })
  })
})

describe("clínicas e equipe", () => {
  it("cria e edita a clínica (tema padrão LIGHT) e valida o slug", async () => {
    const a = await import("@/lib/actions/team")
    serverApiFetch.mockResolvedValueOnce({ id: CUID, slug: "vida" })
    expect(await a.upsertTeamAction({ name: "Clínica Vida", slug: "vida" } as never)).toEqual({ success: true, data: { id: CUID, slug: "vida" } })
    expect(serverApiFetch.mock.calls[0][1].body).toMatchObject({ theme: "LIGHT", logo: null, description: null })

    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await a.upsertTeamAction({ id: CUID, name: "Clínica Vida", slug: "vida" } as never)).success).toBe(true)
    expect(serverApiFetch.mock.calls[1][1].method).toBe("PUT")

    expect((await a.upsertTeamAction({ name: "x", slug: "ok" } as never)).success).toBe(false)
  })

  it("convida, muda o papel e remove membro (e revalida)", async () => {
    const a = await import("@/lib/actions/team")
    serverApiFetch.mockResolvedValue(undefined)

    expect((await a.inviteTeamMemberAction({ teamId: CUID, email: "novo@example.test", role: "MEMBER" })).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith(`/teams/${CUID}/members`, { method: "POST", body: { email: "novo@example.test", role: "MEMBER" } })
    expect((await a.inviteTeamMemberAction({ teamId: CUID, email: "invalido", role: "MEMBER" })).success).toBe(false)

    expect((await a.updateTeamMemberRoleAction({ teamId: CUID, userId: "u2", role: "ADMIN" })).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith(`/teams/${CUID}/members/u2`, { method: "PUT", body: { role: "ADMIN" } })

    expect((await a.removeTeamMemberAction(CUID, "u2")).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith(`/teams/${CUID}/members/u2`, { method: "DELETE" })
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/team")

    serverApiFetch.mockRejectedValueOnce(new ApiError(403, {}))
    expect(await a.removeTeamMemberAction(CUID, "u3")).toEqual({ success: false, error: "Você não tem permissão para esta ação." })
  })
})

describe("onboarding e perfil", () => {
  const perfil = { name: "Dra. Ana", username: "dra-ana", timeZone: "America/Sao_Paulo", theme: "LIGHT", bio: "", brandColor: null, specialty: "Psicologia", council: "CRP", registrationNumber: "06/123", clinicName: "" }

  it("salva o perfil convertendo vazios em null", async () => {
    serverApiFetch.mockResolvedValue(undefined)
    const { completeProfileAction } = await import("@/lib/actions/onboarding")
    const r = await completeProfileAction(perfil as never)
    expect(r).toEqual({ success: true, data: { username: "dra-ana" } })
    expect(serverApiFetch.mock.calls[0][1].body).toMatchObject({ clinicName: null, specialty: "Psicologia", council: "CRP" })
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile")
  })

  it("username inválido não chega na API; conflito de username volta como erro", async () => {
    const { completeProfileAction, completeOnboardingAction } = await import("@/lib/actions/onboarding")
    expect((await completeProfileAction({ ...perfil, username: "A" } as never)).success).toBe(false)
    expect(serverApiFetch).not.toHaveBeenCalled()

    serverApiFetch.mockRejectedValueOnce(new ApiError(409, { detail: "Username já em uso." }))
    expect(await completeProfileAction(perfil as never)).toEqual({ success: false, error: "Username já em uso." })

    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await completeOnboardingAction()).success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard")
  })
})

describe("assinatura e recebimentos", () => {
  it("checkout da clínica e do usuário: devolve a URL ou a mensagem certa", async () => {
    const a = await import("@/lib/actions/billing")
    serverApiFetch.mockResolvedValueOnce({ url: "https://pay.example/c1" })
    expect(await a.createCheckoutSessionAction(CUID)).toEqual({ url: "https://pay.example/c1" })

    serverApiFetch.mockResolvedValueOnce({})
    expect(await a.createCheckoutSessionAction(CUID)).toEqual({ error: "Não foi possível gerar o link de pagamento." })

    serverApiFetch.mockRejectedValueOnce(new ApiError(403, {}))
    expect(await a.createCheckoutSessionAction(CUID)).toEqual({ error: "Apenas o dono da clínica pode assinar." })

    serverApiFetch.mockResolvedValueOnce({ url: "https://pay.example/u1" })
    expect(await a.createUserCheckoutSessionAction("SOLO_PRO")).toEqual({ url: "https://pay.example/u1" })
    expect(serverApiFetch).toHaveBeenLastCalledWith("/user/billing/checkout", { method: "POST", body: { planCode: "SOLO_PRO" } })

    serverApiFetch.mockRejectedValueOnce(new ApiError(502, { detail: "Stripe fora do ar" }))
    expect(await a.createUserCheckoutSessionAction("SOLO_PRO")).toEqual({ error: "Stripe fora do ar" })

    serverApiFetch.mockRejectedValueOnce(new TypeError("bug"))
    await expect(a.createUserCheckoutSessionAction("SOLO_PRO")).rejects.toThrow("bug")
  })

  it("onboarding de recebimentos: URL, causa real do provedor e sessão expirada", async () => {
    const a = await import("@/lib/actions/payouts")
    serverApiFetch.mockResolvedValueOnce({ onboardingUrl: "https://connect.example/x" })
    expect(await a.startPayoutOnboardingAction("STRIPE")).toEqual({ onboardingUrl: "https://connect.example/x" })

    serverApiFetch.mockResolvedValueOnce({})
    expect(await a.startPayoutOnboardingAction()).toMatchObject({ error: expect.stringMatching(/Não foi possível iniciar/) })

    serverApiFetch.mockRejectedValueOnce(new ApiError(401, {}))
    expect(await a.startPayoutOnboardingAction()).toEqual({ error: "Sua sessão expirou. Entre novamente." })

    serverApiFetch.mockRejectedValueOnce(new ApiError(502, { detail: "Connect não habilitado" }))
    expect(await a.startPayoutOnboardingAction()).toEqual({ error: "Connect não habilitado" })

    serverApiFetch.mockRejectedValueOnce(new ApiError(502, {}))
    expect(await a.startPayoutOnboardingAction()).toMatchObject({ error: expect.stringMatching(/recusou/) })

    serverApiFetch.mockRejectedValueOnce(new ApiError(503, { detail: "Recebimentos não configurados" }))
    expect(await a.startPayoutOnboardingAction()).toEqual({ error: "Recebimentos não configurados" })
  })

  it("desvincular conta de recebimento", async () => {
    const a = await import("@/lib/actions/payouts")
    serverApiFetch.mockResolvedValueOnce(null)
    expect(await a.unlinkPayoutAction("p1")).toEqual({ success: true })
    serverApiFetch.mockRejectedValueOnce(new ApiError(403, {}))
    expect(await a.unlinkPayoutAction("p1")).toEqual({ error: "Você não pode desvincular esta conta." })
    serverApiFetch.mockRejectedValueOnce(new ApiError(500, { detail: "falhou" }))
    expect(await a.unlinkPayoutAction("p1")).toEqual({ error: "falhou" })
  })
})

describe("integrações e LGPD", () => {
  it("Google Agenda: conectar e desconectar", async () => {
    const a = await import("@/lib/actions/integrations")
    serverApiFetch.mockResolvedValueOnce({ startUrl: "https://accounts.example/x" })
    expect(await a.startGoogleCalendarAction()).toEqual({ success: true, data: { startUrl: "https://accounts.example/x" } })
    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await a.disconnectGoogleCalendarAction()).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/integrations/google-calendar", { method: "DELETE" })
  })

  it("direitos do titular: valida o e-mail antes de exportar/anonimizar", async () => {
    const a = await import("@/lib/actions/privacy")
    expect((await a.exportPatientAction("nao-e-email")).success).toBe(false)
    expect((await a.anonymizePatientAction("")).success).toBe(false)
    expect(serverApiFetch).not.toHaveBeenCalled()

    serverApiFetch.mockResolvedValueOnce({ total: 2 })
    expect(await a.exportPatientAction("  Maria@Example.test ")).toEqual({ success: true, data: { total: 2 } })
    expect(serverApiFetch).toHaveBeenLastCalledWith("/privacy/patients/export", { method: "POST", body: { email: "Maria@Example.test" } })

    serverApiFetch.mockResolvedValueOnce({ anonimizadas: 3 })
    expect(await a.anonymizePatientAction("maria@example.test")).toEqual({ success: true, data: { anonimizadas: 3 } })
  })

  it("conta: exportar e excluir (a confirmação vai no corpo)", async () => {
    const a = await import("@/lib/actions/privacy")
    serverApiFetch.mockResolvedValueOnce({ conta: {} })
    expect((await a.exportAccountAction()).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/privacy/account/export", { method: "GET" })

    serverApiFetch.mockResolvedValueOnce(undefined)
    expect((await a.deleteAccountAction("EXCLUIR")).success).toBe(true)
    expect(serverApiFetch).toHaveBeenLastCalledWith("/privacy/account", { method: "DELETE", body: { confirm: "EXCLUIR" } })

    serverApiFetch.mockRejectedValueOnce(new ApiError(422, { detail: "Confirmação inválida." }))
    expect(await a.deleteAccountAction("x")).toEqual({ success: false, error: "Confirmação inválida." })
  })
})
