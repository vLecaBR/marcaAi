import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createBooking, cancelBooking } from "@/lib/actions/booking"
import { prisma } from "@/lib/prisma"
import { addDays, setHours, setMinutes, startOfDay, endOfDay } from "date-fns"
import { sendBookingCancelledEmail } from "@/lib/email/send"

// Mock first!
vi.mock("@/lib/email/send", () => {
  return {
    sendBookingCancelledEmail: vi.fn().mockResolvedValue(true),
    sendBookingConfirmedEmail: vi.fn().mockResolvedValue(true),
    sendBookingPendingEmail: vi.fn().mockResolvedValue(true),
    sendOwnerNotifyEmail: vi.fn().mockResolvedValue(true),
  }
})

vi.mock("@/lib/email/resend", () => {
  return {
    resend: {
      emails: { send: vi.fn().mockResolvedValue({ data: { id: "mock-resend-id" }, error: null }) }
    },
    FROM_EMAIL: "mock@mock.com",
    APP_URL: "http://localhost:3000"
  }
})

describe("Booking Server Actions Integration", () => {
  let testUser: any
  let testEventType: any
  let testSchedule: any

  beforeEach(async () => {
    // Limpar o banco antes de cada teste
    await prisma.booking.deleteMany()
    await prisma.scheduleAvailability.deleteMany()
    await prisma.schedule.deleteMany()
    await prisma.eventType.deleteMany()
    await prisma.user.deleteMany()

    testUser = await prisma.user.create({
      data: {
        email: "owner@test.com",
        name: "Owner Test",
        username: "ownertest",
        timeZone: "America/Sao_Paulo",
        onboarded: true,
      },
    })

    testSchedule = await prisma.schedule.create({
      data: {
        userId: testUser.id,
        name: "Default Test Schedule",
        timeZone: "America/Sao_Paulo",
        isDefault: true,
        availabilities: {
          create: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "18:00",
          })),
        },
      },
    })

    testEventType = await prisma.eventType.create({
      data: {
        userId: testUser.id,
        title: "30 Min Meet",
        slug: "30-min-meet",
        duration: 30,
        price: 0,
        currency: "BRL",
        isActive: true,
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("deve criar um agendamento com sucesso e barrar 'Double Booking'", async () => {
    // Escolher um horário amanhã ao meio-dia
    const now = new Date()
    const tomorrow = addDays(now, 1)
    const startTimeUtc = setMinutes(setHours(tomorrow, 12), 0).toISOString()
    const endTimeUtc = setMinutes(setHours(tomorrow, 12), 30).toISOString()

    const bookingInput = {
      eventTypeId: testEventType.id,
      ownerId: testUser.id,
      startTimeUtc,
      endTimeUtc,
      guestTimeZone: "America/Sao_Paulo",
      guestName: "Guest One",
      guestEmail: "guest1@example.com",
      responses: [],
    }

    // 1. Cria o primeiro agendamento
    const result1 = await createBooking(bookingInput)

    expect(result1.status).toBe("success")
    if (result1.status === "success") {
      expect(result1.data.guestEmail).toBe("guest1@example.com")
    }

    // 2. Tenta criar um segundo agendamento EXATAMENTE no mesmo horário (Double Booking)
    const bookingInput2 = {
      ...bookingInput,
      guestName: "Guest Two",
      guestEmail: "guest2@example.com",
    }

    const result2 = await createBooking(bookingInput2)

    // Deve retornar "conflict" ou erro mapeado de conflito
    expect(result2.status).toBe("conflict")
    
    if (result2.status === "conflict") {
      expect(result2.message).toContain("Horário reservado simultaneamente ou conflito de transação.")
    }
  })

  it("deve cancelar um agendamento e chamar a função de email mockada", async () => {
    const now = new Date()
    const tomorrow = addDays(now, 2)
    const startTimeUtc = setMinutes(setHours(tomorrow, 14), 0).toISOString()
    const endTimeUtc = setMinutes(setHours(tomorrow, 14), 30).toISOString()

    // Cria o agendamento
    const createResult = await createBooking({
      eventTypeId: testEventType.id,
      ownerId: testUser.id,
      startTimeUtc,
      endTimeUtc,
      guestTimeZone: "America/Sao_Paulo",
      guestName: "Guest Cancel",
      guestEmail: "guest-cancel@example.com",
      responses: [],
    })

    expect(createResult.status).toBe("success")

    if (createResult.status !== "success") {
      throw new Error("Failed to create test booking")
    }

    const { uid } = createResult.data

    // Cancela o agendamento
    const cancelResult = await cancelBooking(uid, "Desisti do agendamento", "GUEST")

    expect(cancelResult.status).toBe("success")

    // Verifica se o status mudou no banco de dados
    const canceledBooking = await prisma.booking.findUnique({
      where: { uid }
    })

    expect(canceledBooking?.status).toBe("CANCELLED")
    expect(canceledBooking?.cancelReason).toBe("Desisti do agendamento")
    expect(canceledBooking?.canceledBy).toBe("GUEST")

    // Verifica se a função de enviar email de cancelamento foi chamada
    expect(sendBookingCancelledEmail).toHaveBeenCalled()
  })
})
