"use client"

import { useState } from "react"
import { ChevronUp, ChevronDown, Eye } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const screens = [
  { id: "/", label: "Landing page" },
  { id: "/login", label: "Login" },
  { id: "/onboarding", label: "Onboarding" },
  { id: "/[username]", label: "Perfil público (ex)" },
  { id: "/dashboard", label: "Dashboard · Início" },
  { id: "/dashboard/bookings", label: "Meus agendamentos" },
  { id: "/dashboard/event-types", label: "Tipos de eventos" },
  { id: "/dashboard/teams", label: "Equipes" },
  { id: "/settings/profile", label: "Configurações · Perfil" },
  { id: "/settings/availability", label: "Configurações · Disponibilidade" },
]

export function DevNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  if (process.env.NODE_ENV !== "development") return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 bg-card rounded-2xl shadow-xl border border-border/60 p-2 w-64 max-h-[60vh] overflow-y-auto">
          <div className="px-2 py-1.5 text-xs text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>
            Telas do protótipo (Dev)
          </div>
          {screens.map((s) => (
            <Link
              key={s.id}
              href={s.id}
              onClick={() => setOpen(false)}
              className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition ${
                pathname === s.id ? "bg-violet-50 text-primary dark:bg-violet-500/10 dark:text-violet-400" : "hover:bg-muted"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="bg-foreground text-background rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 text-sm hover:opacity-90 transition"
      >
        <Eye size={14}/> Telas {open ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
      </button>
    </div>
  )
}