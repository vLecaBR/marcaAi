import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { BookingPageShell } from "@/components/booking/booking-page-shell"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import { safeBrandColor } from "@/lib/brand-theme"
import type { PublicProfileWithEventsDto } from "@/lib/api/booking-types"

interface Props {
  params: Promise<{ username: string; slug: string }>
}

async function getProfile(username: string): Promise<PublicProfileWithEventsDto | null> {
  try {
    return await serverApiFetch<PublicProfileWithEventsDto>(endpoints.public(username))
  } catch (err) {
    if (isApiError(err) && err.kind === "not_found") return null
    throw err
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params
  const profile = await getProfile(username)
  const event = profile?.eventTypes.find((e) => e.slug === slug)
  if (!event) return { title: "Não encontrado" }
  return { title: `${event.title} · ${profile?.name ?? username}`, description: event.description ?? undefined }
}

/**
 * Página de agendamento de um serviço — via API .NET (`GET /public/{username}`).
 * Os horários NÃO são calculados aqui: o `TimeSlotPicker` busca por dia em `/api/slots`
 * (proxy para `GET /slots` do backend). Marca temável com AA (ADR-0004).
 */
export default async function BookingPage({ params }: Props) {
  const { username, slug } = await params
  const profile = await getProfile(username)
  const event = profile?.eventTypes.find((e) => e.slug === slug)
  if (!profile || !event) notFound()

  const brand = safeBrandColor(profile.brandColor)

  return (
    <main className="min-h-screen bg-surface" style={{ "--brand": brand } as React.CSSProperties}>
      <BookingPageShell
        eventType={{
          id: event.id,
          title: event.title,
          description: event.description,
          duration: event.duration,
          color: event.color,
          locationType: event.locationType,
          price: event.price,
          questions: event.questions,
          requiresConfirm: event.requiresConfirm,
          beforeEventBuffer: event.beforeEventBuffer,
          afterEventBuffer: event.afterEventBuffer,
          bookingLimitDays: event.bookingLimitDays ?? 60,
        }}
        owner={{
          id: profile.id,
          name: profile.name,
          image: profile.image,
          username: profile.username,
          timeZone: profile.timeZone,
          theme: profile.theme,
          brandColor: profile.brandColor,
        }}
      />
    </main>
  )
}
