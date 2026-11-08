// @vitest-environment node
import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import proxy from "@/proxy"

const req = (path: string, init: { method?: string; ip?: string; cookie?: string } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.ip ? { "cf-connecting-ip": init.ip } : {}), ...(init.cookie ? { cookie: init.cookie } : {}) },
  })

describe("proxy (middleware)", () => {
  it("limita só a CRIAÇÃO de agendamento (POST /api/book), 10 por minuto por IP", async () => {
    const ip = "203.0.113.10"
    const codigos: number[] = []
    for (let i = 0; i < 12; i++) codigos.push(proxy(req("/api/book", { method: "POST", ip })).status)
    expect(codigos.slice(0, 10).every((s) => s !== 429)).toBe(true)
    expect(codigos.slice(10)).toEqual([429, 429])
    // outro IP não é afetado
    expect(proxy(req("/api/book", { method: "POST", ip: "203.0.113.11" })).status).not.toBe(429)
  })

  it("não estrangula o checkout: polling, pagar, remarcar e cancelar ficam fora do limite local", () => {
    const ip = "203.0.113.20"
    for (let i = 0; i < 40; i++) {
      expect(proxy(req("/api/book/abc123", { ip })).status).not.toBe(429)                       // polling do pagamento
      expect(proxy(req("/api/book/abc123/pay", { method: "POST", ip })).status).not.toBe(429)
      expect(proxy(req("/api/book/abc123/reschedule", { method: "POST", ip })).status).not.toBe(429)
    }
  })

  it("área logada sem cookie de sessão vai para o login; com cookie passa", () => {
    const sem = proxy(req("/dashboard"))
    expect(sem.status).toBe(307)
    expect(sem.headers.get("location")).toContain("/login")
    expect(proxy(req("/admin")).status).toBe(307)
    expect(proxy(req("/dashboard", { cookie: "marcaai_at=x" })).status).not.toBe(307)
  })

  it("rotas públicas passam sem sessão", () => {
    for (const p of ["/", "/login", "/privacidade", "/dra-ana/consulta"]) expect(proxy(req(p)).status).not.toBe(307)
  })
})
