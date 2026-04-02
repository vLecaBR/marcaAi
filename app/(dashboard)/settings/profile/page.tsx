import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ProfileForm } from "./components/profile-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Meu Perfil | MarcaAí" }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  })

  if (!user) redirect("/login")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Meu Perfil</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Atualize suas informações pessoais e sua URL pública.
        </p>
      </div>

      <div className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
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
      </div>
    </div>
  )
}
