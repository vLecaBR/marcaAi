import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { AvailabilityForm } from "@/components/settings/availability-form"
import { ExceptionsManager } from "@/components/settings/exceptions/exceptions-manager"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Disponibilidade | People OS" }

export default async function AvailabilityPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  let schedule = await prisma.schedule.findFirst({
    where: { userId: session.user.id },
    include: { 
      availabilities: true,
      exceptions: {
        where: { date: { gte: new Date() } },
        orderBy: { date: "asc" }
      }
    },
  })

  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        userId: session.user.id,
        name: "Agenda Padrão",
        timeZone: "America/Sao_Paulo",
        isDefault: true,
        availabilities: {
          create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "09:00",
            endTime: "18:00",
          })),
        },
      },
      include: { availabilities: true, exceptions: true },
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Disponibilidade</h1>
        <p className="text-muted-foreground mt-1">Defina quando você está livre para receber reuniões.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <AvailabilityForm schedule={schedule} />
        </div>

        <div className="h-fit">
          <ExceptionsManager scheduleId={schedule.id} exceptions={schedule.exceptions} />
        </div>
      </div>
    </div>
  )
}
