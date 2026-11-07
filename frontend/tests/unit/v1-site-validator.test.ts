import { afterEach, describe, expect, it, vi } from "vitest"
import { eventTypeSchema } from "@/lib/validators/event-type"

describe("PUBLIC_HOST (host exibido nos links de agendamento)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("deriva o host de NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.clinicaexemplo.com.br/")
    vi.resetModules()
    const { PUBLIC_HOST } = await import("@/lib/site")
    expect(PUBLIC_HOST).toBe("app.clinicaexemplo.com.br")
  })

  it("sem a variável (ou inválida) cai no padrão visual", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    vi.resetModules()
    expect((await import("@/lib/site")).PUBLIC_HOST).toBe("marcaai.app")

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "não-é-url")
    vi.resetModules()
    expect((await import("@/lib/site")).PUBLIC_HOST).toBe("marcaai.app")
  })
})

describe("eventTypeSchema — cobrança", () => {
  const base = { title: "Consulta", slug: "consulta", duration: 30, color: "TEAL", locationType: "IN_PERSON" } as const

  it("payOnSite é falso por padrão (pagar online para confirmar)", () => {
    const r = eventTypeSchema.parse({ ...base, price: 15000 })
    expect(r.payOnSite).toBe(false)
  })

  it("aceita cobrar no atendimento", () => {
    expect(eventTypeSchema.parse({ ...base, price: 15000, payOnSite: true }).payOnSite).toBe(true)
  })

  it("recusa preço negativo", () => {
    expect(eventTypeSchema.safeParse({ ...base, price: -1 }).success).toBe(false)
  })
})
