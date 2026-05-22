"use client"

import { useState } from "react"
import Link from "next/link"
import { TeamForm } from "./team-form"
import { Users, Settings, Plus, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type TeamData = {
  id: string
  name: string
  slug: string
  description: string | null
  theme: string
  brandColor: string | null
  members: { role: string; user: { id: string; name: string | null; image: string | null; email: string } }[]
  _count: { eventTypes: number }
}

interface TeamListProps {
  teams: TeamData[]
  currentUserId: string
}

export function TeamList({ teams, currentUserId }: TeamListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<TeamData | null>(null)

  function handleEdit(team: TeamData) {
    setEditing(team)
    setIsFormOpen(true)
  }

  function handleClose() {
    setEditing(null)
    setIsFormOpen(false)
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "OWNER": return "Proprietário"
      case "ADMIN": return "Administrador"
      case "MEMBER": return "Membro"
      default: return role
    }
  }

  const GRADIENTS = [
    "from-violet-500 to-fuchsia-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500",
    "from-rose-500 to-pink-500",
  ]

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team, index) => {
          const myMembership = team.members.find(m => m.user.id === currentUserId)
          const gradient = GRADIENTS[index % GRADIENTS.length]

          return (
            <Card key={team.id} className="rounded-2xl border-border/60 overflow-hidden hover:shadow-md transition">
              <div className={cn("h-20 bg-gradient-to-br", gradient)} />
              <div className="p-5 -mt-7">
                <div className="w-14 h-14 rounded-2xl bg-card border-4 border-card shadow-sm flex items-center justify-center mb-3">
                  <Users className="text-primary" size={22}/>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold truncate">{team.name}</h3>
                  {myMembership && (
                    <Badge variant="secondary" className="rounded-full text-xs shrink-0">
                      {getRoleLabel(myMembership.role)}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {team.members.length} membro{team.members.length !== 1 ? 's' : ''}
                </div>
                <div className="mt-5 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-lg flex-1 gap-1.5 h-9"
                    onClick={() => handleEdit(team)}
                  >
                    <Settings size={13}/> Gerenciar
                  </Button>
                  <Button 
                    asChild 
                    size="sm" 
                    className="rounded-lg flex-1 gap-1.5 h-9"
                  >
                    <Link href={`/dashboard/teams/${team.id}`}>
                      Abrir <ArrowUpRight size={13}/>
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}

        {/* Botão Nova Equipe */}
        <Card 
          onClick={() => setIsFormOpen(true)}
          className="rounded-2xl border-dashed border-2 border-border hover:border-primary/50 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition cursor-pointer flex flex-col items-center justify-center min-h-[220px] text-muted-foreground shadow-none p-5"
        >
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3 text-muted-foreground">
            <Plus size={20}/>
          </div>
          <div className="text-sm font-medium">Criar nova equipe</div>
        </Card>
      </div>

      <TeamForm
        open={isFormOpen}
        onClose={handleClose}
        defaultValues={editing ? {
          id: editing.id,
          name: editing.name,
          slug: editing.slug,
          description: editing.description,
          theme: editing.theme as any,
          brandColor: editing.brandColor,
        } : undefined}
      />
    </>
  )
}