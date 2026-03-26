import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { LoginCard } from "@/components/auth/login-card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Entrar",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const session = await auth()
  const params = await searchParams

  if (session?.user) {
    redirect(params.callbackUrl ?? "/dashboard")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-4">
      <LoginCard
        callbackUrl={params.callbackUrl}
        error={params.error}
      />
    </main>
  )
}