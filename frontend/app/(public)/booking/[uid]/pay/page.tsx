import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { PaymentClient } from "@/components/payment/payment-client"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import type { BookingDetailDto } from "@/lib/api/booking-types"

export const metadata: Metadata = { title: "Pagamento da consulta" }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

/**
 * Checkout do paciente (spec §3.3). Paleta Teal institucional — pagamento transmite segurança,
 * então não usamos a cor de marca do profissional aqui. Se já estiver pago, vai para a confirmação.
 */
export default async function PayPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params

  let booking: BookingDetailDto
  try {
    booking = await serverApiFetch<BookingDetailDto>(endpoints.bookings.byUid(uid))
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") notFound()
    throw err
  }

  if (booking.paymentStatus === "PAID") redirect(`/booking/${uid}`)
  // Pagar no local / sem preço: não há checkout online.
  if (booking.payOnSite || !booking.priceCents) redirect(`/booking/${uid}`)
  const expired = booking.status === "CANCELLED"

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="px-6 py-5 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/"><Logo size={24} /></Link>
          <Link href={`/booking/${uid}`} className="text-xs text-muted-foreground hover:text-foreground">
            Detalhes do agendamento
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-12">
        {expired ? (
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold">Esta reserva expirou</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              O prazo para pagar terminou e o horário foi liberado. Você pode escolher um novo horário.
            </p>
            {booking.ownerUsername && booking.eventSlug && (
              <Link
                href={`/${booking.ownerUsername}/${booking.eventSlug}`}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground"
              >
                Escolher outro horário
              </Link>
            )}
          </div>
        ) : (
          <PaymentClient
            uid={uid}
            eventTitle={booking.eventTitle}
            ownerName={booking.ownerName}
            returnUrl={`${APP_URL}/booking/${uid}`}
            dueAt={booking.paymentDueAt ?? null}
            priceCents={booking.priceCents ?? null}
          />
        )}
      </main>
    </div>
  )
}
