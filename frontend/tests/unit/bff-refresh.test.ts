// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const rawApiFetch = vi.fn()
const refreshSession = vi.fn()
vi.mock("@/lib/api/http-client", () => ({ rawApiFetch: (...a: unknown[]) => rawApiFetch(...a) }))
vi.mock("@/lib/api/session", () => ({ refreshSession: (...a: unknown[]) => refreshSession(...a) }))

import { proxyToApi } from "@/lib/api/bff"
import { ApiError } from "@/lib/api/problem-details"

const req = (method = "GET", cookie = "marcaai_at=velho; marcaai_csrf=csrf1", body?: unknown) =>
  new NextRequest("http://localhost:3000/api/bff/bookings?status=PENDING", {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe("BFF proxyToApi — refresh e retry", () => {
  beforeEach(() => {
    rawApiFetch.mockReset()
    refreshSession.mockReset()
  })

  it("sucesso direto: repassa data, status e Set-Cookie da API", async () => {
    rawApiFetch.mockResolvedValue({ data: [{ uid: "a" }], status: 200, setCookies: ["marcaai_at=n; Path=/"] })

    const res = await proxyToApi(req(), "/bookings")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ uid: "a" }])
    expect(res.headers.getSetCookie()).toEqual(["marcaai_at=n; Path=/"])
    expect(rawApiFetch).toHaveBeenCalledTimes(1)
    expect(rawApiFetch.mock.calls[0][0]).toBe("/bookings?status=PENDING") // preserva a query
    expect(rawApiFetch.mock.calls[0][2]).toMatchObject({ csrfToken: "csrf1" })
  })

  it("204 não pode ter corpo", async () => {
    rawApiFetch.mockResolvedValue({ data: null, status: 204, setCookies: [] })
    const res = await proxyToApi(req("PUT", undefined, { a: 1 }), "/me/profile")
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
  })

  it("401 → refresh → retry com os cookies novos, e devolve os dois conjuntos de Set-Cookie", async () => {
    rawApiFetch
      .mockRejectedValueOnce(new ApiError(401, { detail: "expirado" }))
      .mockResolvedValueOnce({ data: { ok: true }, status: 200, setCookies: ["extra=1; Path=/"] })
    refreshSession.mockResolvedValue({ me: {}, setCookies: ["marcaai_at=novo; Path=/", "marcaai_rt=novo2; Path=/"] })

    const res = await proxyToApi(req(), "/bookings")

    expect(res.status).toBe(200)
    expect(rawApiFetch).toHaveBeenCalledTimes(2)
    // O retry usa o access token rotacionado, mantendo os demais cookies.
    const cookieDoRetry = rawApiFetch.mock.calls[1][2].cookieHeader as string
    expect(cookieDoRetry).toContain("marcaai_at=novo")
    expect(cookieDoRetry).toContain("marcaai_csrf=csrf1")
    expect(cookieDoRetry).not.toContain("velho")
    expect(res.headers.getSetCookie()).toEqual(["marcaai_at=novo; Path=/", "marcaai_rt=novo2; Path=/", "extra=1; Path=/"])
  })

  it("401 com refresh inválido devolve 401 sem tentar de novo", async () => {
    rawApiFetch.mockRejectedValue(new ApiError(401, { detail: "expirado" }))
    refreshSession.mockResolvedValue(null)

    const res = await proxyToApi(req(), "/bookings")

    expect(res.status).toBe(401)
    expect(rawApiFetch).toHaveBeenCalledTimes(1)
  })

  it("só tenta o refresh uma vez: 401 também no retry", async () => {
    rawApiFetch.mockRejectedValue(new ApiError(401, { detail: "ainda não" }))
    refreshSession.mockResolvedValue({ me: {}, setCookies: ["marcaai_at=novo"] })

    const res = await proxyToApi(req(), "/bookings")

    expect(res.status).toBe(401)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(rawApiFetch).toHaveBeenCalledTimes(2)
  })

  it("erro que não é 401 repassa ProblemDetails com o status original, sem refresh", async () => {
    rawApiFetch.mockRejectedValue(new ApiError(409, { detail: "Horário ocupado", code: "SLOT_CONFLICT" }))

    const res = await proxyToApi(req("POST", undefined, {}), "/bookings")

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("SLOT_CONFLICT")
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it("erro inesperado (não ApiError) sobe para o chamador", async () => {
    rawApiFetch.mockRejectedValue(new Error("bug"))
    await expect(proxyToApi(req(), "/bookings")).rejects.toThrow("bug")
  })
})
