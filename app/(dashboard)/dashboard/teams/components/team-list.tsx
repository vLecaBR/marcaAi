"use client"

import { useState } from "react"
import Link from "next/link"
import { TeamForm } from "./team-form"
import { Users, MoreVertical, Plus, ArrowRight } from "lucide-react"

type TeamData = {
  id: string
  name: string
  slug: string
  description: string | null
  theme: string
  brandColor: string | null
  members: { role: string; user: { name: string | null; image: string | null; email: string } }[]
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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div
            key={team.id}
            className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700 hover:bg-zinc-900/60"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
                  <Users className="h-5 w-5" />
                </div>
                <button
                  onClick={() => handleEdit(team)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">
                {team.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-400 line-clamp-2">
                {team.description || "Sem descrição"}
              </p>
              <div className="mt-4 flex gap-3 text-xs text-zinc-500">
                <span>{team.members.length} membro(s)</span>
                <span>•</span>
                <span>{team._count.eventTypes} evento(s)</span>
              </div>
            </div>
            
            <div className="mt-5 border-t border-zinc-800 pt-4 flex items-center justify-between">
              <div className="flex -space-x-2">
                {team.members.slice(0, 5).map((member, i) => (
                  <div 
                    key={i} 
                    className="h-8 w-8 rounded-full ring-2 ring-zinc-900 bg-zinc-800 flex items-center justify-center overflow-hidden"
                    title={`${member.user.name || member.user.email} (${member.role})`}
                  >
                    {member.user.image ? (
                      <img src={member.user.image} alt={member.user.name || ""} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-white">{member.user.name?.[0]?.toUpperCase() || member.user.email[0].toUpperCase()}</span>
                    )}
                  </div>
                ))}
                {team.members.length > 5 && (
                  <div className="h-8 w-8 rounded-full ring-2 ring-zinc-900 bg-zinc-800 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">+{team.members.length - 5}</span>
                  </div>
                )}
              </div>
              
              <Link 
                href={`/dashboard/teams/${team.id}`}
                className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                Gerenciar <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}

        {/* Botão Nova Equipe */}
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-700 bg-transparent text-zinc-500 transition-all hover:border-violet-600/50 hover:bg-violet-600/5 hover:text-violet-400"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-current">
            <Plus className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">Nova Equipe</span>
        </button>
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
