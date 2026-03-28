// app/dashboard/page.tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <main className="min-h-screen bg-[#09090b] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-white">
          Olá, {session.user.name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-2 text-zinc-400">
          Seu dashboard está sendo construído. Fase 5 a caminho.
        </p>
      </div>
    </main>
  )
}