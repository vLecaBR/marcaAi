import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { computeAvailableSlots, groupSlotsByDate } from "@/lib/scheduling/slots"
import { startOfDay, endOfDay, addDays, parseISO } from "date-fns"
import type { ScheduleData } from "@/lib/scheduling/types"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const ownerId     = searchParams.get("ownerId")
  const eventTypeId = searchParams.get("eventTypeId")
  const dateStr     = searchParams.get("date")
  const tz          = searchParams.get("tz") ?? "UTC"

  if (!ownerId || !eventTypeId || !dateStr) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 })
  }

  try {
    const [eventType, schedule, existingBookings] = await Promise.all([
      prisma.eventType.findFirst({
        where: { id: eventTypeId, userId: ownerId, isActive: true },
        select: {
          duration: true, beforeEventBuffer: true,
          afterEventBuffer: true, bookingLimitDays: true,
        },
      }),
      prisma.schedule.findFirst({
        where: { userId: ownerId, isDefault: true },
        include: { availabilities: true, exceptions: true },
      }),
      prisma.booking.findMany({
        where: {
          userId: ownerId,
          status: { in: ["CONFIRMED", "PENDING"] },
          startTime: { gte: startOfDay(parseISO(dateStr)) },
          endTime:   { lte: endOfDay(addDays(parseISO(dateStr), 1)) },
        },
        select: { startTime: true, endTime: true },
      }),
    ])

    if (!eventType || !schedule) {
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 })
    }

    const dateFrom = startOfDay(parseISO(dateStr))
    const dateTo   = endOfDay(parseISO(dateStr))

    const scheduleData: ScheduleData = {
      timeZone: schedule.timeZone,
      availabilities: schedule.availabilities,
      exceptions: schedule.exceptions.map((ex) => ({
        ...ex,
        type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
      })),
    }

    const windows = buildAvailableWindows(scheduleData, dateFrom, dateTo)
    const slots   = computeAvailableSlots(windows, existingBookings, {
      userId: ownerId,
      eventDuration: eventType.duration,
      beforeBuffer:  eventType.beforeEventBuffer,
      afterBuffer:   eventType.afterEventBuffer,
      dateFrom,
      dateTo,
      viewerTimeZone: tz,
    })

    const grouped = groupSlotsByDate(slots, tz)
    const daySlots = grouped[dateStr] ?? []

    return NextResponse.json({ slots: daySlots })
  } catch (err) {
    console.error("[GET /api/slots]", err)
    return NextResponse.json({ error: "Erro interno." }, { status: 500 })
  }
}