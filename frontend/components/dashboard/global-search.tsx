"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

/** Busca do topo do dashboard: leva à lista de pacientes filtrada (nome, e-mail ou telefone). */
export function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState("")
  return (
    <form
      role="search"
      className="relative w-80 max-w-full"
      onSubmit={(e) => {
        e.preventDefault()
        const term = q.trim()
        router.push(term ? `/dashboard/patients?q=${encodeURIComponent(term)}` : "/dashboard/patients")
      }}
    >
      <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar pacientes"
        placeholder="Buscar pacientes (nome, e-mail, telefone)…"
        className="h-10 rounded-xl border-0 bg-muted/50 pl-9"
      />
    </form>
  )
}
