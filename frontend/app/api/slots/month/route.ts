/**
 * Dias do mês com horário livre (público) — proxy para `GET {API}/slots/month`. O calendário público só habilita
 * esses dias (antes habilitava todos, inclusive fins de semana sem agenda).
 */

import { NextRequest, NextResponse } from "next/server"
import { rawApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams
  const ownerId = sp.get("ownerId")
  const eventTypeId = sp.get("eventTypeId")
  const month = sp.get("month")
  const tz = sp.get("tz") ?? "UTC"
  if (!ownerId || !eventTypeId || !month) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 })
  }

  try {
    const result = await rawApiFetch<{ days: string[] }>(endpoints.slotsMonth, {
      method: "GET",
      query: { ownerId, eventTypeId, month, tz },
    })
    return NextResponse.json({ days: result.data?.days ?? [] })
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json(
        { error: err.problem.detail ?? "Erro ao buscar o calendário." },
        { status: err.status || 500 },
      )
    }
    throw err
  }
}
