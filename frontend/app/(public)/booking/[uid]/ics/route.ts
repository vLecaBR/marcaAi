/**
 * "Adicionar à agenda": devolve um arquivo .ics (iCalendar) da consulta, para Google/Apple/Outlook.
 * Público por uid, como a própria página da consulta; só contém título, horário, local e o nome do profissional.
 */

import { NextRequest, NextResponse } from "next/server"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { BookingDetailDto } from "@/lib/api/booking-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const { uid } = await params
  let b: BookingDetailDto
  try {
    b = await serverApiFetch<BookingDetailDto>(endpoints.bookings.byUid(uid))
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") return new NextResponse("Não encontrado", { status: 404 })
    throw err
  }

  const place =
    b.locationType === "IN_PERSON" || b.locationType === "PHONE" ? (b.locationDetail ?? "") : (b.meetingUrl ?? "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MarcaAi//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.uid}@marcaai`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startTime)}`,
    `DTEND:${stamp(b.endTime)}`,
    `SUMMARY:${esc(`${b.eventTitle} com ${b.ownerName ?? "profissional"}`)}`,
    ...(place ? [`LOCATION:${esc(place)}`] : []),
    `DESCRIPTION:${esc("Consulta agendada pelo MarcaAí.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="consulta-${b.uid}.ics"`,
      "Cache-Control": "no-store",
    },
  })
}
