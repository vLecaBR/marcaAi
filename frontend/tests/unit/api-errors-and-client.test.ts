import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, apiErrorFromResponse, isApiError } from "@/lib/api/problem-details"
import { apiClient } from "@/lib/api/client"

describe("ApiError.kind ↔ status HTTP", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [422, "validation"],
    [502, "payment_provider"],
    [500, "server"],
    [503, "server"],
    [400, "unknown"],
    [418, "unknown"],
  ])("status %i vira kind %s", (status, kind) => {
    expect(new ApiError(status, {}).kind).toBe(kind)
  })

  it("usa detail, depois title, depois uma mensagem padrão", () => {
    expect(new ApiError(409, { detail: "Horário ocupado", title: "Conflito" }).message).toBe("Horário ocupado")
    expect(new ApiError(409, { title: "Conflito" }).message).toBe("Conflito")
    expect(new ApiError(500, {}).message).toBe("Erro na API (500)")
  })

  it("expõe code de domínio e erros de campo", () => {
    const e = new ApiError(422, { code: "SLOT_CONFLICT", errors: { email: ["inválido"] } })
    expect(e.code).toBe("SLOT_CONFLICT")
    expect(e.fieldErrors).toEqual({ email: ["inválido"] })
    expect(new ApiError(422, {}).fieldErrors).toEqual({})
  })

  it("network() cria erro sem status HTTP e guarda a causa", () => {
    const causa = new Error("ECONNREFUSED")
    const e = ApiError.network(causa)
    expect(e.kind).toBe("network")
    expect(e.status).toBe(0)
    expect(e.cause).toBe(causa)
  })

  it("isApiError distingue ApiError de erros comuns", () => {
    expect(isApiError(new ApiError(404, {}))).toBe(true)
    expect(isApiError(new Error("x"))).toBe(false)
    expect(isApiError(null)).toBe(false)
  })
})

describe("apiErrorFromResponse", () => {
  it("lê ProblemDetails JSON e preserva o status", async () => {
    const res = new Response(JSON.stringify({ detail: "Já cancelada", code: "ALREADY_CANCELLED" }), { status: 409 })
    const e = await apiErrorFromResponse(res)
    expect(e.kind).toBe("conflict")
    expect(e.message).toBe("Já cancelada")
    expect(e.code).toBe("ALREADY_CANCELLED")
  })

  it("corpo que não é JSON cai no statusText sem estourar", async () => {
    const res = new Response("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" })
    const e = await apiErrorFromResponse(res)
    expect(e.kind).toBe("payment_provider")
    expect(e.problem.title).toBe("Bad Gateway")
  })

  it("corpo vazio também é tratado", async () => {
    const e = await apiErrorFromResponse(new Response(null, { status: 404, statusText: "Not Found" }))
    expect(e.kind).toBe("not_found")
  })
})

describe("apiClient (browser → BFF)", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(res: Response | Error) {
    const fn = vi.fn(async () => {
      if (res instanceof Error) throw res
      return res
    })
    vi.stubGlobal("fetch", fn)
    return fn
  }

  it("chama o BFF same-origin com query string e Accept JSON", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify([{ uid: "a" }]), { status: 200 }))

    const data = await apiClient<{ uid: string }[]>("bookings", { query: { status: "PENDING", vazio: undefined, nulo: null } })

    expect(data).toEqual([{ uid: "a" }])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/bff/bookings?status=PENDING")
    expect(init.credentials).toBe("same-origin")
    expect(new Headers(init.headers).get("Accept")).toBe("application/json")
  })

  it("serializa objeto como JSON e define Content-Type", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    const out = await apiClient("/bookings/abc/cancel", { method: "POST", body: { reason: "x" } })

    expect(out).toBeNull() // 204
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBe(JSON.stringify({ reason: "x" }))
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
  })

  it("não serializa FormData como JSON", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }))
    const fd = new FormData()
    fd.append("a", "b")

    await apiClient("/upload", { method: "POST", body: fd })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBe(fd)
    expect(new Headers(init.headers).get("Content-Type")).toBeNull()
  })

  it("resposta de erro vira ApiError com o kind do status", async () => {
    stubFetch(new Response(JSON.stringify({ detail: "Sem permissão" }), { status: 403 }))
    await expect(apiClient("/teams/1")).rejects.toMatchObject({ kind: "forbidden", status: 403, message: "Sem permissão" })
  })

  it("falha de rede vira ApiError network", async () => {
    stubFetch(new TypeError("Failed to fetch"))
    await expect(apiClient("/me")).rejects.toMatchObject({ kind: "network" })
  })

  it("erro com corpo não-JSON usa o statusText", async () => {
    stubFetch(new Response("oops", { status: 500, statusText: "Internal Server Error" }))
    await expect(apiClient("/me")).rejects.toMatchObject({ kind: "server", status: 500 })
  })
})
