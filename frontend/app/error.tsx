"use client"

import { useEffect } from "react"
import Link from "next/link"

/** Erro inesperado de renderização: mensagem humana e saída clara (sem detalhes técnicos para o usuário). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Avisa o painel do dono (sem dado pessoal: mensagem curta, digest e caminho sem querystring).
  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname }),
    }).catch(() => {})
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não conseguimos carregar esta página agora. Tente novamente em instantes; se continuar, avise o profissional ou o suporte.
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground">Tentar de novo</button>
        <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-border px-6 text-sm font-medium">Início</Link>
      </div>
    </main>
  )
}
