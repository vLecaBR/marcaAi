import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { BookingPageShell } from "@/components/booking/booking-page-shell"
import { cn } from "@/lib/utils"
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
      price: true,
      questions: { orderBy: { order: "asc" } },
      requiresConfirm: true, beforeEventBuffer: true,
      afterEventBuffer: true, bookingLimitDays: true,
      user: {
        select: {
          id: true, name: true, image: true, username: true, timeZone: true, theme: true, brandColor: true,
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
  }) as any

  if (!eventType || !eventType.user.schedules[0]) notFound()

  return (
    <main 
      className={cn(
        "min-h-screen",
        eventType.user.theme === "LIGHT" ? "bg-slate-50 text-slate-900" : "bg-[#09090b] text-white"
      )}
      style={{
        "--brand": eventType.user.brandColor ?? "#7c3aed",
      } as React.CSSProperties}
    >
      <BookingPageShell
        eventType={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description,
          duration: eventType.duration,
          color: eventType.color,
          locationType: eventType.locationType,
          price: eventType.price,
          questions: eventType.questions,
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
          theme: eventType.user.theme,
          brandColor: eventType.user.brandColor,
        }}
        schedule={{
          timeZone: eventType.user.schedules[0].timeZone,
          availabilities: eventType.user.schedules[0].availabilities,
          exceptions: eventType.user.schedules[0].exceptions.map((ex: any) => ({
            ...ex,
            type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
          })),
        }}
      />
    </main>
  )
}