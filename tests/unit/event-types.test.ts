import { describe, it, expect, vi, beforeEach } from "vitest"
import { getEventTypesAction, upsertEventTypeAction, toggleEventTypeAction, deleteEventTypeAction } from "@/lib/actions/event-types"
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
    eventType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    eventTypeQuestion: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      // Create a mock transaction client that just points back to prisma mocks
      return cb({
        eventType: prisma.eventType,
        eventTypeQuestion: prisma.eventTypeQuestion,
      })
    }),
  },
}))

describe("Event Types Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getEventTypesAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await getEventTypesAction()
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve listar eventos do usuário", async () => {
      const mockEvents = [{ id: "1", title: "Test Event" }]
      vi.mocked(prisma.eventType.findMany).mockResolvedValueOnce(mockEvents as any)

      const result = await getEventTypesAction()
      expect(prisma.eventType.findMany).toHaveBeenCalledWith({
        where: { userId: "test-user-id" },
        orderBy: { createdAt: "asc" },
        select: expect.any(Object),
      })
      expect(result).toEqual({ success: true, data: mockEvents })
    })
  })

  describe("upsertEventTypeAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await upsertEventTypeAction({ title: "T", slug: "s", duration: 30 } as any)
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se validação falhar", async () => {
      const result = await upsertEventTypeAction({ title: "", slug: "s", duration: 30 } as any)
      expect(result.success).toBe(false)
    })

    it("deve retornar erro se slug já existir para outro evento", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce({ id: "other" } as any)
      const result = await upsertEventTypeAction({
        title: "Test",
        slug: "test-slug",
        duration: 30,
        color: "VIOLET",
        locationType: "GOOGLE_MEET",
        isActive: true,
        requiresConfirm: false,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        questions: [],
      })
      expect(result).toEqual({ success: false, error: "Você já tem um evento com este slug." })
    })

    it("deve criar um novo evento com perguntas", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.eventType.upsert).mockResolvedValueOnce({ id: "new-event", slug: "test-slug" } as any)

      const result = await upsertEventTypeAction({
        title: "Test",
        slug: "test-slug",
        duration: 30,
        color: "VIOLET",
        locationType: "GOOGLE_MEET",
        isActive: true,
        requiresConfirm: false,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        questions: [{ label: "Q1", type: "TEXT", required: false, order: 0 }],
      })

      expect(prisma.$transaction).toHaveBeenCalled()
      expect(prisma.eventType.upsert).toHaveBeenCalled()
      expect(prisma.eventTypeQuestion.deleteMany).toHaveBeenCalledWith({ where: { eventTypeId: "new-event" } })
      expect(prisma.eventTypeQuestion.createMany).toHaveBeenCalled()
      
      expect(result).toEqual({ success: true, data: { id: "new-event", slug: "test-slug" } })
    })
  })

  describe("toggleEventTypeAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await toggleEventTypeAction("eventId", true)
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se o evento não for encontrado", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce(null)
      const result = await toggleEventTypeAction("eventId", true)
      expect(result).toEqual({ success: false, error: "Evento não encontrado." })
    })

    it("deve ativar ou desativar com sucesso", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce({ id: "eventId" } as any)
      vi.mocked(prisma.eventType.update).mockResolvedValueOnce({} as any)

      const result = await toggleEventTypeAction("eventId", false)
      expect(prisma.eventType.update).toHaveBeenCalledWith({
        where: { id: "eventId" },
        data: { isActive: false },
      })
      expect(result).toEqual({ success: true, data: undefined })
    })
  })

  describe("deleteEventTypeAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await deleteEventTypeAction("eventId")
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se o evento não for encontrado", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce(null)
      const result = await deleteEventTypeAction("eventId")
      expect(result).toEqual({ success: false, error: "Evento não encontrado." })
    })

    it("deve deletar com sucesso", async () => {
      vi.mocked(prisma.eventType.findFirst).mockResolvedValueOnce({ id: "eventId" } as any)
      vi.mocked(prisma.eventType.delete).mockResolvedValueOnce({} as any)

      const result = await deleteEventTypeAction("eventId")
      expect(prisma.eventType.delete).toHaveBeenCalledWith({
        where: { id: "eventId" },
      })
      expect(result).toEqual({ success: true, data: undefined })
    })
  })
})