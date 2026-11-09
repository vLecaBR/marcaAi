/**
 * Criação de agendamento (público) — proxy para `POST {API}/bookings`.
 * Substitui `createBooking` (Prisma). Mapeia o corpo para `CreateBookingRequest` da API e
 * repassa a resposta (incluindo `pix` quando o serviço tem preço).
 *
 * `responses` (perguntas) e `consentAccepted` (LGPD) são repassados; `recurringCount` ainda não é suportado.
 */

import { NextRequest, NextResponse } from "next/server"
import { rawApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import { IDEMPOTENCY_HEADER, isValidIdempotencyKey } from "@/lib/idempotency"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface BookBody {
  ownerId: string
  eventTypeId: string
  guestName: string
  guestEmail: string
  guestPhone?: string | null
  guestNotes?: string | null
  startTimeUtc: string
  endTimeUtc: string
  guestTimeZone: string
  responses?: { questionId: string; answer: string }[]
  consentAccepted?: boolean
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: BookBody
  try {
    body = (await req.json()) as BookBody
  } catch {
    return NextResponse.json({ status: "error", message: "Corpo inválido." }, { status: 400 })
  }

  const payload = {
    ownerId: body.ownerId,
    eventTypeId: body.eventTypeId,
    guestName: body.guestName,
    guestEmail: body.guestEmail,
    guestPhone: body.guestPhone ?? null,
    guestNotes: body.guestNotes ?? null,
    startTimeUtc: body.startTimeUtc,
    endTimeUtc: body.endTimeUtc,
    guestTimeZone: body.guestTimeZone,
    responses: body.responses ?? [],
    consentAccepted: body.consentAccepted === true,
  }

  try {
    // Idempotency-Key do navegador (duplo clique / retry de rede): a API devolve a mesma consulta em vez de criar outra.
    const key = req.headers.get(IDEMPOTENCY_HEADER)
    const result = await rawApiFetch<Record<string, unknown>>(endpoints.bookings.root, {
      method: "POST",
      body: payload,
      headers: isValidIdempotencyKey(key) ? { [IDEMPOTENCY_HEADER]: key } : undefined,
    })
    return NextResponse.json({ status: "success", ...result.data }, { status: 201 })
  } catch (err) {
    if (isApiError(err)) {
      const status =
        err.kind === "conflict" ? "conflict" : err.kind === "not_found" ? "not_found" : "error"
      return NextResponse.json(
        { status, message: err.problem.detail ?? "Erro ao agendar." },
        { status: err.status || 400 },
      )
    }
    throw err
  }
}
