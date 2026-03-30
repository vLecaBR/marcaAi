import { prisma } from "@/lib/prisma"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { computeAvailableSlots } from "@/lib/scheduling/slots"
import { startOfDay, endOfDay, addDays, isEqual } from "date-fns"
import type { CreateBookingInput } from "@/lib/validators/booking"
import type { ScheduleData } from "@/lib/scheduling/types"

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export type BookingSuccess = {
  status: "success"
  data: {
    uid:           string
    startTime:     Date
    endTime:       Date
    guestName:     string
    guestEmail:    string
    eventTitle:    string
    ownerName:     string | null
    requiresConfirm: boolean
  }
}

export type BookingError =
  | { status: "conflict";      message: string }
  | { status: "unavailable";   message: string }
  | { status: "not_found";     message: string }
  | { status: "validation";    message: string }
  | { status: "internal";      message: string }

export type BookingResult = BookingSuccess | BookingError

// ─── Função principal ─────────────────────────────────────────────────────────

export async function createBooking(
  input: CreateBookingInput
): Promise<BookingResult> {
  const startUtc = new Date(input.startTimeUtc)
  const endUtc   = new Date(input.endTimeUtc)

  // ── 1. Carrega EventType e Schedule ────────────────────────────────────────
  const eventType = await prisma.eventType.findFirst({
    where: {
      id:       input.eventTypeId,
      userId:   input.ownerId,
      isActive: true,
    },
    include: {
      user: {
        include: {
          schedules: {
            where:   { isDefault: true },
            include: {
              availabilities: true,
              exceptions: {
                where: {
                  date: {
                    gte: startOfDay(startUtc),
                    lte: endOfDay(addDays(startUtc, 1)),
                  },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  })

  if (!eventType) {
    return { status: "not_found", message: "Tipo de evento não encontrado ou inativo." }
  }

  const schedule = eventType.user.schedules[0]
  if (!schedule) {
    return { status: "not_found", message: "Agenda do organizador não configurada." }
  }

  // ── 2. Valida duração do slot solicitado ───────────────────────────────────
  const requestedMinutes =
    (endUtc.getTime() - startUtc.getTime()) / 1000 / 60

  if (requestedMinutes !== eventType.duration) {
    return {
      status:  "validation",
      message: `Duração inválida. Esperado: ${eventType.duration} min.`,
    }
  }

  // ── 3. Verifica se o slot solicitado existe nas janelas disponíveis ────────
  const scheduleData: ScheduleData = {
    timeZone:       schedule.timeZone,
    availabilities: schedule.availabilities,
    exceptions:     schedule.exceptions.map((ex) => ({
      ...ex,
      type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
    })),
  }

  const dateFrom = startOfDay(startUtc)
  const dateTo   = endOfDay(startUtc)

  const availableWindows = buildAvailableWindows(scheduleData, dateFrom, dateTo)

  // Verifica geometricamente se startUtc está dentro de alguma janela
  const slotFitsInWindow = availableWindows.some((day) =>
    day.windows.some(
      (w) =>
        startUtc.getTime() >= w.start.getTime() &&
        endUtc.getTime()   <= w.end.getTime()
    )
  )

  if (!slotFitsInWindow) {
    return {
      status:  "unavailable",
      message: "Este horário está fora da disponibilidade do organizador.",
    }
  }

  // ── 4. TRANSAÇÃO COM BLOQUEIO PESSIMISTA ───────────────────────────────────
  //
  // Usamos $queryRaw para executar SELECT ... FOR UPDATE SKIP LOCKED
  // diretamente na tabela de bookings. Isso garante que:
  //   a) Nenhuma outra transação concorrente leia as mesmas linhas
  //   b) SKIP LOCKED evita deadlock — transações concorrentes
  //      simplesmente pulam as linhas bloqueadas
  //
  // O fluxo dentro da transação:
  //   1. Bloqueia linhas conflitantes existentes (FOR UPDATE SKIP LOCKED)
  //   2. Re-verifica se há conflito DENTRO da transação
  //   3. Se limpo → insere o novo booking
  //   4. Se conflito → rollback automático pelo throw

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        // ── 4a. SELECT FOR UPDATE SKIP LOCKED ─────────────────────────────
        // Busca e bloqueia qualquer booking que se sobreponha ao slot desejado
        // A lógica de sobreposição: A começa antes de B terminar E A termina depois de B começar
        const conflictingRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM bookings
          WHERE
            user_id   = ${input.ownerId}
            AND status IN ('CONFIRMED', 'PENDING')
            AND start_time < ${endUtc}::timestamptz
            AND end_time   > ${startUtc}::timestamptz
          FOR UPDATE SKIP LOCKED
        `

        // ── 4b. Se há conflito real → rejeita ────────────────────────────
        if (conflictingRows.length > 0) {
          throw new ConflictError("Horário já reservado.")
        }

        // ── 4c. Cria o booking ────────────────────────────────────────────
        const newBooking = await tx.booking.create({
          data: {
            userId:        input.ownerId,
            eventTypeId:   input.eventTypeId,
            guestName:     input.guestName,
            guestEmail:    input.guestEmail,
            guestPhone:    input.guestPhone  ?? null,
            guestNotes:    input.guestNotes  ?? null,
            startTime:     startUtc,
            endTime:       endUtc,
            guestTimeZone: input.guestTimeZone,
            status:        eventType.requiresConfirm ? "PENDING" : "CONFIRMED",
            responses: input.responses?.length
              ? {
                  createMany: {
                    data: input.responses.map((r) => ({
                      questionId: r.questionId,
                      answer:     r.answer,
                    })),
                  },
                }
              : undefined,
          },
          select: {
            uid:       true,
            startTime: true,
            endTime:   true,
            guestName: true,
            guestEmail: true,
            status:    true,
            eventType: {
              select: {
                title:          true,
                requiresConfirm: true,
                user: { select: { name: true } },
              },
            },
          },
        })

        return newBooking
      },
      {
        // Timeout de 10s para a transação inteira
        timeout: 10_000,
        // Nível de isolamento máximo para garantir consistência
        isolationLevel: "Serializable",
      }
    )

    return {
      status: "success",
      data: {
        uid:             booking.uid,
        startTime:       booking.startTime,
        endTime:         booking.endTime,
        guestName:       booking.guestName,
        guestEmail:      booking.guestEmail,
        eventTitle:      booking.eventType.title,
        ownerName:       booking.eventType.user.name,
        requiresConfirm: booking.eventType.requiresConfirm,
      },
    }
  } catch (err) {
    if (err instanceof ConflictError) {
      return { status: "conflict", message: err.message }
    }

    // Prisma serialization failure — outra transação ganhou a corrida
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2034"
    ) {
      return {
        status:  "conflict",
        message: "Horário reservado simultaneamente. Por favor, escolha outro.",
      }
    }

    console.error("[createBooking] Erro inesperado:", err)
    return { status: "internal", message: "Erro interno ao criar agendamento." }
  }
}

// ─── Erro de conflito tipado ──────────────────────────────────────────────────

class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
  }
}

// ─── Cancelamento de booking ──────────────────────────────────────────────────

export type CancelResult =
  | { status: "success" }
  | { status: "not_found";  message: string }
  | { status: "forbidden";  message: string }
  | { status: "internal";   message: string }

export async function cancelBooking(
  uid:    string,
  reason: string,
  canceledBy: "OWNER" | "GUEST"
): Promise<CancelResult> {
  try {
    const booking = await prisma.booking.findUnique({
      where:  { uid },
      select: { id: true, status: true, userId: true },
    })

    if (!booking) {
      return { status: "not_found", message: "Agendamento não encontrado." }
    }

    if (booking.status === "CANCELLED") {
      return { status: "forbidden", message: "Agendamento já está cancelado." }
    }

    await prisma.booking.update({
      where: { uid },
      data: {
        status:       "CANCELLED",
        cancelReason: reason,
        canceledAt:   new Date(),
        canceledBy,
      },
    })

    return { status: "success" }
  } catch (err) {
    console.error("[cancelBooking]", err)
    return { status: "internal", message: "Erro ao cancelar agendamento." }
  }
}