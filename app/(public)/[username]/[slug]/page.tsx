import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { BookingPageShell } from "@/components/booking/booking-page-shell"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"
import { unstable_cache } from "next/cache"
import { addDays, startOfDay } from "date-fns"
import { buildAvailableWindows } from "@/lib/scheduling/availability"
import { computeAvailableSlots, groupSlotsByDate, getAvailableDates } from "@/lib/scheduling/slots"

const getCachedEventTypeMeta = async (username: string, slug: string) => {
  return unstable_cache(
    async () => {
      return prisma.eventType.findFirst({
        where: { slug, isActive: true, user: { username } },
        select: { title: true, description: true, user: { select: { name: true } } },
      })
    },
    [`public-event-meta-${username}-${slug}`],
    { tags: ["event-types"], revalidate: 60 }
  )()
}

const getCachedEventType = async (username: string, slug: string) => {
  return unstable_cache(
    async () => {
      return prisma.eventType.findFirst({
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
      })
    },
    [`public-event-type-${username}-${slug}`],
    { tags: ["event-types"], revalidate: 60 }
  )()
}

interface Props {
  params: Promise<{ username: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, slug } = await params
  const eventType = await getCachedEventTypeMeta(username, slug)
  if (!eventType) return { title: "Não encontrado" }
  return {
    title: `${eventType.title} · ${eventType.user.name}`,
    description: eventType.description ?? undefined,
  }
}

export default async function BookingPage({ params }: Props) {
  const { username, slug } = await params

  const eventType = await getCachedEventType(username, slug) as any

  if (!eventType || !eventType.user.schedules[0]) notFound()

  // Compute available slots on the server to avoid heavy client-side computation during hydration
  const scheduleData = {
    timeZone: eventType.user.schedules[0].timeZone,
    availabilities: eventType.user.schedules[0].availabilities,
    exceptions: eventType.user.schedules[0].exceptions.map((ex: any) => ({
      ...ex,
      type: ex.type as "BLOCKED" | "VACATION" | "OVERRIDE",
    })),
  }
  const dateFrom = startOfDay(new Date())
  const bookingLimitDays = eventType.bookingLimitDays ?? 60
  const dateTo = addDays(dateFrom, bookingLimitDays)
  
  const windows = buildAvailableWindows(scheduleData, dateFrom, dateTo)
  const slots = computeAvailableSlots(windows, [], {
    userId: eventType.user.id,
    eventDuration: eventType.duration,
    beforeBuffer: eventType.beforeEventBuffer,
    afterBuffer: eventType.afterEventBuffer,
    dateFrom,
    dateTo,
    viewerTimeZone: eventType.user.timeZone, // Assume viewer = owner initially
    bookingLimitDays,
  })

  // To prevent passing huge JSON structures with Dates, convert slots correctly or rely on the fact
  // that Server Components can serialize plain objects. But Date objects might be tricky if they are deep.
  // Actually, Server Components serialize Date objects properly.
  // We'll just pass the grouped results.
  const initialGroupedSlots = groupSlotsByDate(slots, eventType.user.timeZone)
  const initialAvailableDates = getAvailableDates(slots, eventType.user.timeZone)

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
        schedule={scheduleData}
        initialGroupedSlots={initialGroupedSlots}
        initialAvailableDates={initialAvailableDates}
      />
    </main>
  )
}