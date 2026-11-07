/**
 * Remarcação (paciente pelo link ou profissional logado) — proxy para `POST {API}/bookings/{uid}/reschedule`.
 * Os limites (24h de antecedência, 2 remarcações) valem só para o paciente; a API decide pelo cookie de sessão.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { rawApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const schema = z.object({ startTimeUtc: z.string().min(10), endTimeUtc: z.string().min(10) })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const { uid } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Horário inválido." }, { status: 422 })

  try {
    const result = await rawApiFetch(endpoints.bookings.reschedule(uid), { method: "POST", body: parsed.data })
    return NextResponse.json(result.data ?? { ok: true })
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json(
        { error: err.problem.detail ?? "Não foi possível remarcar.", kind: err.kind },
        { status: err.status || 500 },
      )
    }
    throw err
  }
}
