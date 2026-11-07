import type { Metadata } from "next"
import { ProfileForm } from "./components/profile-form"
import { Card } from "@/components/ui/card"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import type { ProfileDto } from "@/lib/api/types"

export const metadata: Metadata = { title: "Meu perfil" }

/**
 * Perfil — via API .NET. Identidade base vem de `GET /auth/me`; o restante, de `GET /me/profile`.
 */
export default async function ProfilePage() {
  const me = await requireOnboarded()

  const profile = await serverApiFetch<ProfileDto>(endpoints.me.profile).catch(() => null)

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
            name: profile?.name ?? null,
            username: me.username,
            timeZone: me.timeZone,
            bio: profile?.bio ?? null,
            image: profile?.image ?? null,
            email: me.email,
            theme: profile?.theme ?? "LIGHT",
            brandColor: profile?.brandColor ?? null,
            specialty: profile?.specialty ?? null,
            council: profile?.council ?? null,
            registrationNumber: profile?.registrationNumber ?? null,
            clinicName: profile?.clinicName ?? null,
          }}
        />
      </Card>
    </div>
  )
}
