/**
 * Erros de renderização do navegador → painel do dono (`POST {API}/client-errors`). Sem dado pessoal: só mensagem curta,
 * digest do Next e o caminho SEM querystring. Sempre responde 204 (nunca atrapalha a tela de erro).
 */

import { NextRequest, NextResponse } from "next/server"
import { rawApiFetch } from "@/lib/api/http-client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const b = (await req.json()) as { message?: string; digest?: string; path?: string }
    await rawApiFetch("/client-errors", {
      method: "POST",
      body: {
        message: String(b.message ?? "erro").slice(0, 300),
        digest: b.digest ? String(b.digest).slice(0, 64) : null,
        path: String(b.path ?? "").split("?")[0].slice(0, 200),
      },
    })
  } catch {
    /* melhor esforço */
  }
  return new NextResponse(null, { status: 204 })
}
