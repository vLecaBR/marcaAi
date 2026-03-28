import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Configurar conta" }

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.onboarded) redirect("/dashboard")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      schedules: {
        where: { isDefault: true },
        include: { availabilities: true },
        take: 1,
      },
    },
  })

  if (!user) redirect("/login")

  const schedule = user.schedules[0]

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-12">
      <OnboardingWizard
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          username: user.username,
          timeZone: user.timeZone,
          bio: user.bio,
        }}
        schedule={
          schedule
            ? {
                id: schedule.id,
                timeZone: schedule.timeZone,
                availabilities: schedule.availabilities,
              }
            : null
        }
      />
    </main>
  )
}