import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { BookingPageShell } from "@/components/booking/booking-page-shell"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ username: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params
  const eventType = await prisma.eventType.findFirst({
    where: { slug, isActive: true, user: { username } },
    select: { title: true, description: true, user: { select: { name: true } } },
  })
  if (!eventType) return { title: "Não encontrado" }
  return {
    title: `${eventType.title} · ${eventType.user.name}`,
    description: eventType.description ?? undefined,
  }
}

export default async function BookingPage({ params }: Props) {
  const { username, slug } = await params

  const eventType = await prisma.eventType.findFirst({
    where: { slug, isActive: true, user: { username } },
    select: {
      id: true, title: true, slug: true, description: true,
      duration: true, color: true, locationType: true,
      requiresConfirm: true, beforeEventBuffer: true,
      afterEventBuffer: true, bookingLimitDays: true,
      user: {
        select: {
          id: true, name: true, image: true, username: true, timeZone: true,
          schedules: {
            where: { isDefault: true },
            include: {
              availabilities: true,
              exceptions: true,
            },
            take: 1,
          },
        },
      },
    },
  })

  if (!eventType || !eventType.user.schedules[0]) notFound()

  return (
    <main className="min-h-screen bg-[#09090b]">
      <BookingPageShell
        eventType={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description,
          duration: eventType.duration,
          color: eventType.color,
          locationType: eventType.locationType,
          requiresConfirm: eventType.requiresConfirm,
          beforeEventBuffer: eventType.beforeEventBuffer,
          afterEventBuffer: eventType.afterEventBuffer,
          bookingLimitDays: eventType.bookingLimitDays,
        }}
        owner={{
          id: eventType.user.id,
          name: eventType.user.name,
          image: eventType.user.image,
          username: eventType.user.username ?? "",
          timeZone: eventType.user.timeZone,
        }}
        schedule={{
          timeZone: eventType.user.schedules[0].timeZone,
          availabilities: eventType.user.schedules[0].availabilities,
          exceptions: eventType.user.schedules[0].exceptions.map((ex) => ({
            ...ex,
            type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
          })),
        }}
      />
    </main>
  )
}