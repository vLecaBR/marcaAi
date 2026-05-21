import { describe, it, expect, vi, beforeEach } from "vitest"
import { completeProfileAction, completeOnboardingAction } from "@/lib/actions/onboarding"
import { prisma } from "@/lib/prisma"

const mockSession = { user: { id: "test-user-id" } }

vi.mock("@/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe("Onboarding Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("completeProfileAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await completeProfileAction({
        name: "Test",
        username: "test",
        timeZone: "UTC",
      })
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id" // restore
    })

    it("deve retornar erro se validação falhar", async () => {
      const result = await completeProfileAction({
        name: "", // name too short
        username: "test",
        timeZone: "UTC",
      })
      expect(result.success).toBe(false)
    })

    it("deve retornar erro se username já estiver em uso", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({ id: "other-user", email: "test@test.com" } as any)
      const result = await completeProfileAction({
        name: "Test",
        username: "test",
        timeZone: "UTC",
      })
      expect(result).toEqual({ success: false, error: "Este username já está em uso." })
    })

    it("deve atualizar perfil e revalidar a rota", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: "test-user-id" } as any)

      const result = await completeProfileAction({
        name: "Test",
        username: "test",
        timeZone: "UTC",
        bio: "Test bio",
        theme: "DARK",
        brandColor: "#ffffff",
      })

      expect(prisma.user.update).toHaveBeenCalled()
      expect(result).toEqual({ success: true, data: { username: "test" } })
    })
  })

  describe("completeOnboardingAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await completeOnboardingAction()
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id" // restore
    })

    it("deve marcar onboarding como completo", async () => {
      vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: "test-user-id" } as any)
      const result = await completeOnboardingAction()
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "test-user-id" },
        data: { onboarded: true },
      })
      expect(result).toEqual({ success: true, data: undefined })
    })
  })
})