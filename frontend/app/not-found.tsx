import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-6 text-center">
      <Link href="/"><Logo size={26} /></Link>
      <div>
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O link pode estar incorreto ou a página foi removida. Se você veio de um link de agendamento, confira com o profissional.
        </p>
      </div>
      <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground">Ir para o início</Link>
    </main>
  )
}
