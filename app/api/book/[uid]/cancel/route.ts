import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cancelBooking } from "@/lib/actions/booking"

const cancelSchema = z.object({
  reason:     z.string().min(1).max(500).default("Cancelado pelo solicitante."),
  canceledBy: z.enum(["OWNER", "GUEST"]).default("GUEST"),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    )
  }

  const result = await cancelBooking(uid, parsed.data.reason, parsed.data.canceledBy)

  switch (result.status) {
    case "success":
      return NextResponse.json({ message: "Agendamento cancelado." })

    case "not_found":
      return NextResponse.json({ error: result.message }, { status: 404 })

    case "forbidden":
      return NextResponse.json({ error: result.message }, { status: 409 })

    case "internal":
    default:
      return NextResponse.json({ error: result.message }, { status: 500 })
  }
}