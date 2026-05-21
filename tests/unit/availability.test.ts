import { describe, it, expect, vi, beforeEach } from "vitest"
import { saveAvailabilityAction } from "@/lib/actions/availability"
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
      update: vi.fn(),
    },
    scheduleAvailability: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((operations) => Promise.all(operations)),
  },
}))

describe("Availability Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deve retornar erro se não autenticado", async () => {
    // @ts-expect-error - mock
    mockSession.user.id = null
    const result = await saveAvailabilityAction({
      scheduleId: "cuid123",
      timeZone: "UTC",
      availabilities: [],
    })
    expect(result).toEqual({ success: false, error: "Não autorizado." })
    mockSession.user.id = "test-user-id"
  })

  it("deve retornar erro se os dados forem inválidos", async () => {
    const result = await saveAvailabilityAction({
      scheduleId: "cuid123",
      timeZone: "", // Inválido
      availabilities: [],
    })
    expect(result.success).toBe(false)
  })

  it("deve retornar erro se a agenda não existir", async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(null)
    const result = await saveAvailabilityAction({
      scheduleId: "cuid123456789012345678901",
      timeZone: "UTC",
      availabilities: [],
    })
    expect(result).toEqual({ success: false, error: "Agenda não encontrada." })
  })

  it("deve salvar a disponibilidade e revalidar a rota", async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce({ id: "cuid123456789012345678901" } as any)
    vi.mocked(prisma.schedule.update).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.scheduleAvailability.deleteMany).mockResolvedValueOnce({} as any)
    vi.mocked(prisma.scheduleAvailability.createMany).mockResolvedValueOnce({} as any)

    const result = await saveAvailabilityAction({
      scheduleId: "cuid123456789012345678901",
      timeZone: "UTC",
      availabilities: [
        {
          dayOfWeek: 1,
          enabled: true,
          intervals: [{ startTime: "09:00", endTime: "18:00" }],
        },
        {
          dayOfWeek: 2,
          enabled: false, // não deve ser salvo
          intervals: [{ startTime: "09:00", endTime: "18:00" }],
        },
      ],
    })

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.schedule.update).toHaveBeenCalled()
    expect(prisma.scheduleAvailability.deleteMany).toHaveBeenCalled()
    expect(prisma.scheduleAvailability.createMany).toHaveBeenCalledWith({
      data: [{ scheduleId: "cuid123456789012345678901", dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }]
    })
    expect(result).toEqual({ success: true, data: undefined })
  })
})