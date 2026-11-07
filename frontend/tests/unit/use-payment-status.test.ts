import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { usePaymentStatus } from "@/lib/hooks/use-payment-status"

function resposta(paymentStatus: string, status = "CONFIRMED") {
  return new Response(JSON.stringify({ uid: "u1", status, paymentStatus }), { status: 200 })
}

describe("usePaymentStatus (polling com backoff)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const avanca = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it("desligado ou sem uid: fica ocioso e não consulta", async () => {
    const { result } = renderHook(() => usePaymentStatus(null, true))
    await avanca(10_000)
    expect(result.current.phase).toBe("idle")
    expect(fetchMock).not.toHaveBeenCalled()

    const off = renderHook(() => usePaymentStatus("u1", false))
    await avanca(10_000)
    expect(off.result.current.phase).toBe("idle")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("primeira checagem é rápida e PAID encerra o polling", async () => {
    fetchMock.mockResolvedValue(resposta("PAID"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))
    expect(result.current.phase).toBe("polling")

    await avanca(900)

    expect(result.current).toMatchObject({ phase: "paid", paymentStatus: "PAID", bookingStatus: "CONFIRMED" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/book/u1")

    await avanca(60_000) // terminou: não consulta mais
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("FAILED encerra como failed", async () => {
    fetchMock.mockResolvedValue(resposta("FAILED"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))
    await avanca(900)
    expect(result.current.phase).toBe("failed")
  })

  it("reembolso é terminal e não vira falha", async () => {
    fetchMock.mockResolvedValue(resposta("REFUNDED"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))
    await avanca(900)
    expect(result.current.phase).toBe("paid")
    expect(result.current.paymentStatus).toBe("REFUNDED")
  })

  it("PENDING continua com backoff progressivo 2s → 3s → 5s", async () => {
    fetchMock.mockResolvedValue(resposta("PENDING", "PENDING"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))

    await avanca(800)   // t=0,8s  1ª
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await avanca(1_900) // +1,9s < 2s: ainda não
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await avanca(200)   // passou 2s → 2ª
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await avanca(3_000) // +3s → 3ª
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await avanca(5_000) // +5s → 4ª
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.current.phase).toBe("polling")
    expect(result.current.paymentStatus).toBe("PENDING")
  })

  it("falha de rede é ignorada e o polling continua", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(resposta("PAID"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))

    await avanca(800)
    expect(result.current.phase).toBe("polling")
    await avanca(2_100)
    expect(result.current.phase).toBe("paid")
  })

  it("passa de ~90s sem confirmação: timeout", async () => {
    fetchMock.mockResolvedValue(resposta("PENDING", "PENDING"))
    const { result } = renderHook(() => usePaymentStatus("u1", true))

    await avanca(100_000)

    expect(result.current.phase).toBe("timeout")
  })

  it("desmontar cancela o polling", async () => {
    fetchMock.mockResolvedValue(resposta("PENDING", "PENDING"))
    const { unmount } = renderHook(() => usePaymentStatus("u1", true))
    await avanca(800)
    const chamadas = fetchMock.mock.calls.length

    unmount()
    await avanca(30_000)

    expect(fetchMock.mock.calls.length).toBe(chamadas)
  })
})
