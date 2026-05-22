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
      price: true,
      teamId: true,
      questions: {
        orderBy: { order: "asc" }
      },
      _count: { select: { bookings: true } },
    },
  })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  })

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: session.user.id } } },
    select: { id: true, name: true }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Tipos de eventos</h1>
        <p className="text-muted-foreground mt-1">Crie eventos para compartilhar e receber agendamentos na sua agenda.</p>
      </div>
      
      <EventTypeList
        eventTypes={eventTypes as any}
        username={user?.username ?? ""}
        teams={teams}
      />
    </div>
  )
}