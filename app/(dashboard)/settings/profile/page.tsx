import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ProfileForm } from "./components/profile-form"
import type { Metadata } from "next"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Meu Perfil | Marca AI" }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  })

  if (!user) redirect("/login")

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Perfil</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie como você aparece para quem agenda com você.
        </p>
      </div>

      <Card className="p-7 rounded-2xl border-border/60 max-w-3xl shadow-sm">
        <ProfileForm 
          user={{
            name: user.name,
            username: user.username,
            timeZone: user.timeZone,
            bio: user.bio,
            image: user.image,
            email: user.email,
            theme: user.theme,
            brandColor: user.brandColor,
          }}
        />
      </Card>
    </div>
  )
}
