import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora do bundle do Next; aqui só precisa existir.
vi.mock("server-only", () => ({}))

// Cabeçalhos da requisição em curso (IP do usuário atrás do Cloudflare).
const requestHeaders = new Map<string, string>()
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ toString: () => "marcaai_at=jwt; marcaai_csrf=csrf-cookie", get: (n: string) => (n === "marcaai_csrf" ? { value: "csrf-cookie" } : undefined) }),
}))

import { rawApiFetch, serverApiFetch } from "@/lib/api/http-client"

function respostaJson(body: unknown, init: ResponseInit = { status: 200 }, setCookies: string[] = []) {
  const h = new Headers({ "content-type": "application/json" })
  setCookies.forEach((c) => h.append("set-cookie", c))
  return new Response(JSON.stringify(body), { ...init, headers: h })
}

describe("rawApiFetch (server → API .NET)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    requestHeaders.clear()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  it("injeta o header CSRF só em mutations", async () => {
    fetchMock.mockImplementation(async () => respostaJson({})) // Response novo a cada chamada (corpo lê uma vez)

    await rawApiFetch("/x", { method: "GET" }, { csrfToken: "tok" })
    await rawApiFetch("/x", { method: "POST", body: {} }, { csrfToken: "tok" })
    await rawApiFetch("/x", { method: "DELETE" }, { csrfToken: "tok" })

    const get = new Headers(fetchMock.mock.calls[0][1].headers)
    const post = new Headers(fetchMock.mock.calls[1][1].headers)
    const del = new Headers(fetchMock.mock.calls[2][1].headers)
    expect(get.get("X-XSRF-TOKEN")).toBeNull()
    expect(post.get("X-XSRF-TOKEN")).toBe("tok")
    expect(del.get("X-XSRF-TOKEN")).toBe("tok")
  })

  it("repassa o cookie de sessão explicitamente e nunca usa cache", async () => {
    fetchMock.mockImplementation(async () => respostaJson({}))

    await rawApiFetch("/me", {}, { cookieHeader: "marcaai_at=abc" })

    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init.headers).get("Cookie")).toBe("marcaai_at=abc")
    expect(init.cache).toBe("no-store")
  })

  it("repassa o IP real do usuário (Cloudflare) para o rate limit da API", async () => {
    requestHeaders.set("cf-connecting-ip", "203.0.113.7")
    fetchMock.mockImplementation(async () => respostaJson({}))

    await rawApiFetch("/slots")

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("CF-Connecting-IP")).toBe("203.0.113.7")
  })

  it("sem CF usa o primeiro IP do x-forwarded-for", async () => {
    requestHeaders.set("x-forwarded-for", "198.51.100.9, 10.0.0.1")
    fetchMock.mockImplementation(async () => respostaJson({}))

    await rawApiFetch("/slots")

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("CF-Connecting-IP")).toBe("198.51.100.9")
  })

  it("monta a query ignorando valores vazios", async () => {
    fetchMock.mockImplementation(async () => respostaJson({}))

    await rawApiFetch("/slots", { query: { date: "2030-01-01", tz: undefined, x: null, n: 3, ok: false } })

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/slots\?date=2030-01-01&n=3&ok=false$/)
  })

  it("devolve data, status e todos os Set-Cookie", async () => {
    fetchMock.mockResolvedValue(respostaJson({ id: "u1" }, { status: 200 }, ["marcaai_at=novo; Path=/", "marcaai_rt=novo2; Path=/"]))

    const r = await rawApiFetch<{ id: string }>("/auth/refresh", { method: "POST" })

    expect(r.data).toEqual({ id: "u1" })
    expect(r.status).toBe(200)
    expect(r.setCookies).toHaveLength(2)
  })

  it("204 devolve data nula", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const r = await rawApiFetch("/x", { method: "DELETE" })
    expect(r.data).toBeNull()
  })

  it("401 vira ApiError unauthorized; falha de transporte vira network", async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ detail: "não logado" }, { status: 401 }))
    await expect(rawApiFetch("/me")).rejects.toMatchObject({ kind: "unauthorized" })

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(rawApiFetch("/me")).rejects.toMatchObject({ kind: "network" })
  })

  it("serverApiFetch lê os cookies da requisição e usa o CSRF do cookie", async () => {
    fetchMock.mockResolvedValue(respostaJson({ ok: true }))

    const data = await serverApiFetch<{ ok: boolean }>("/teams", { method: "POST", body: { name: "x" } })

    expect(data).toEqual({ ok: true })
    const h = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(h.get("Cookie")).toContain("marcaai_at=jwt")
    expect(h.get("X-XSRF-TOKEN")).toBe("csrf-cookie")
  })
})
