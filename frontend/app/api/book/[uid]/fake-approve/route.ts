/**
 * Aprova o pagamento SIMULADO (`POST {API}/dev/payments/{uid}/approve`). Só existe de fato quando a API roda com
 * `Payments:Provider=Fake` (desenvolvimento/testes): em qualquer outro caso a API responde 404 e esta rota repassa o 404.
 * Passa pelo servidor do Next (e não direto do navegador) porque a CSP de produção só permite falar com o próprio site.
 */

import { NextRequest, NextResponse } from "next/server"
import { rawApiFetch } from "@/lib/api/http-client"
import { isApiError } from "@/lib/api/problem-details"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const { uid } = await params
  try {
    await rawApiFetch(`/dev/payments/${encodeURIComponent(uid)}/approve`, { method: "POST" })
    return NextResponse.json({ paid: true })
  } catch (err) {
    if (isApiError(err)) return NextResponse.json({ error: err.problem.detail ?? "Indisponível." }, { status: err.status || 404 })
    throw err
  }
}
