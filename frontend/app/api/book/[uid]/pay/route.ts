/**
 * Iniciar pagamento (público) — proxy para `POST {API}/bookings/{uid}/pay`.
 * Corpo: `{ provider: "MERCADO_PAGO" | "STRIPE" }`. Retorna a intenção de pagamento
 * (clientSecret do Stripe ou dados do PIX). Ver spec §3.3.
 */

import { NextRequest, NextResponse } from "next/server"
import { rawApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import { IDEMPOTENCY_HEADER, isValidIdempotencyKey } from "@/lib/idempotency"
import type { PaymentIntentDto, PaymentProviderName } from "@/lib/api/booking-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const { uid } = await params

  let provider: PaymentProviderName
  try {
    provider = ((await req.json()) as { provider?: PaymentProviderName }).provider as PaymentProviderName
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 })
  }
  if (provider !== "MERCADO_PAGO" && provider !== "STRIPE") {
    return NextResponse.json({ error: "Provedor inválido." }, { status: 422 })
  }

  try {
    const key = req.headers.get(IDEMPOTENCY_HEADER)
    const result = await rawApiFetch<PaymentIntentDto>(endpoints.bookings.pay(uid), {
      method: "POST",
      body: { provider },
      headers: isValidIdempotencyKey(key) ? { [IDEMPOTENCY_HEADER]: key } : undefined,
    })
    return NextResponse.json(result.data)
  } catch (err) {
    if (isApiError(err)) {
      // 409 já paga / conta inativa · 422 sem preço · 502 falha no provedor (spec §3.4).
      return NextResponse.json(
        { error: err.problem.detail ?? "Não foi possível iniciar o pagamento.", kind: err.kind },
        { status: err.status || 500 },
      )
    }
    throw err
  }
}
