import { describe, expect, it } from "vitest"
import { isValidIdempotencyKey, newIdempotencyKey } from "@/lib/idempotency"

describe("idempotency", () => {
  it("gera chaves válidas e diferentes a cada chamada", () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    expect(isValidIdempotencyKey(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it("aceita só o formato da API (8–64, letras/números/_/-)", () => {
    expect(isValidIdempotencyKey("abcd1234")).toBe(true)
    expect(isValidIdempotencyKey("a-b_c-1234567890")).toBe(true)
    expect(isValidIdempotencyKey("curta")).toBe(false)
    expect(isValidIdempotencyKey("tem espaço aqui")).toBe(false)
    expect(isValidIdempotencyKey("x".repeat(65))).toBe(false)
    expect(isValidIdempotencyKey(null)).toBe(false)
    expect(isValidIdempotencyKey(undefined)).toBe(false)
  })
})
