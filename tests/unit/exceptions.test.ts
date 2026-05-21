import { describe, it, expect, vi, beforeEach } from "vitest"
import { addExceptionAction, removeExceptionAction } from "@/lib/actions/exceptions"
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
    schedule: {
      findFirst: vi.fn(),
    },
    scheduleException: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

describe("Exceptions Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("addExceptionAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await addExceptionAction({
        scheduleId: "cuid123456789012345678901",
        date: "2024-01-01",
        type: "BLOCKED",
      })
      expect(result).toEqual({ success: false, error: "Não autorizado" })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se dados inválidos", async () => {
      const result = await addExceptionAction({
        scheduleId: "cuid123456789012345678901",
        date: "01/01/2024", // invalid format
        type: "BLOCKED",
      })
      expect(result).toEqual({ success: false, error: "Dados inválidos." })
    })

    it("deve retornar erro se agenda não existir", async () => {
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(null)
      const result = await addExceptionAction({
        scheduleId: "cuid123456789012345678901",
        date: "2024-01-01",
        type: "BLOCKED",
      })
      expect(result).toEqual({ success: false, error: "Agenda não encontrada." })
    })

    it("deve retornar erro se já existir bloqueio", async () => {
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce({ id: "cuid123456789012345678901" } as any)
      vi.mocked(prisma.scheduleException.findFirst).mockResolvedValueOnce({ id: "exc123" } as any)
      
      const result = await addExceptionAction({
        scheduleId: "cuid123456789012345678901",
        date: "2024-01-01",
        type: "BLOCKED",
      })
      expect(result).toEqual({ success: false, error: "Já existe um bloqueio para esta data." })
    })

    it("deve criar o bloqueio com sucesso", async () => {
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce({ id: "cuid123456789012345678901" } as any)
      vi.mocked(prisma.scheduleException.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.scheduleException.create).mockResolvedValueOnce({ id: "new-exc" } as any)

      const result = await addExceptionAction({
        scheduleId: "cuid123456789012345678901",
        date: "2024-01-01",
        type: "BLOCKED",
        reason: "Férias",
      })
      
      expect(prisma.scheduleException.create).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })
  })

  describe("removeExceptionAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await removeExceptionAction("exc123")
      expect(result).toEqual({ success: false, error: "Não autorizado" })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se exceção não existir", async () => {
      vi.mocked(prisma.scheduleException.findFirst).mockResolvedValueOnce(null)
      const result = await removeExceptionAction("exc123")
      expect(result).toEqual({ success: false, error: "Bloqueio não encontrado ou sem permissão" })
    })

    it("deve remover a exceção com sucesso", async () => {
      vi.mocked(prisma.scheduleException.findFirst).mockResolvedValueOnce({ id: "exc123" } as any)
      vi.mocked(prisma.scheduleException.delete).mockResolvedValueOnce({} as any)
      
      const result = await removeExceptionAction("exc123")
      expect(prisma.scheduleException.delete).toHaveBeenCalledWith({
        where: { id: "exc123" },
      })
      expect(result).toEqual({ success: true })
    })
  })
})