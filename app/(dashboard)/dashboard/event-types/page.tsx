import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { EventTypeList } from "@/components/event-types/event-type-list"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tipos de Evento" }

export default async function EventTypesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      duration: true,
      color: true,
      isActive: true,
      requiresConfirm: true,
      beforeEventBuffer: true,
      afterEventBuffer: true,
      bookingLimitDays: true,
      locationType: true,
      locationValue: true,
      _count: { select: { bookings: true } },
    },
  })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Tipos de Evento</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Crie e gerencie os tipos de reunião que as pessoas podem agendar com você.
        </p>
      </div>
      <EventTypeList
        eventTypes={eventTypes}
        username={user?.username ?? ""}
      />
    </div>
  )
}