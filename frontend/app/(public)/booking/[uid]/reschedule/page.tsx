import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { RescheduleClient } from "@/components/booking/reschedule-client"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { BookingDetailDto } from "@/lib/api/booking-types"

export const metadata: Metadata = { title: "Remarcar consulta", robots: { index: false } }

export default async function ReschedulePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  let b: BookingDetailDto
  try {
    b = await serverApiFetch<BookingDetailDto>(endpoints.bookings.byUid(uid))
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") notFound()
    throw err
  }

  const duration = Math.max(0, Math.round((new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 60000))
  const active = b.status === "CONFIRMED" || b.status === "PENDING"

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border/60 bg-background px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={`/booking/${uid}`} className="text-sm text-muted-foreground hover:text-foreground">← Voltar à consulta</Link>
          <Link href="/"><Logo size={22} /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {active && b.ownerId && b.eventTypeId ? (
          <RescheduleClient
            uid={uid}
            ownerId={b.ownerId}
            eventTypeId={b.eventTypeId}
            eventTitle={b.eventTitle}
            ownerName={b.ownerName}
            duration={duration}
            currentStartUtc={b.startTime}
            guestTimeZone={b.guestTimeZone}
            bookingLimitDays={b.bookingLimitDays ?? 60}
            rescheduleCount={b.rescheduleCount ?? 0}
          />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
            <h1 className="text-lg font-semibold">Esta consulta não pode ser remarcada</h1>
            <p className="mt-2 text-sm text-muted-foreground">Só consultas confirmadas ou pendentes podem ser remarcadas.</p>
          </div>
        )}
      </main>
    </div>
  )
}
