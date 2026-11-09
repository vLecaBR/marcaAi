"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { UserPlus, Trash2, Loader2, Info, Users } from "lucide-react"
import { Stagger, StaggerItem } from "@/components/motion/primitives"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RoleBadge, roleLabel } from "@/components/team/role-badge"
import {
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateTeamMemberRoleAction,
} from "@/lib/actions/team"
import type { TeamMemberDto, TeamRoleName } from "@/lib/api/types"

const inviteFormSchema = z.object({
  email: z.string().email("E-mail inválido."),
  role: z.enum(["ADMIN", "MEMBER"]),
})
type InviteFormInput = z.infer<typeof inviteFormSchema>

interface Props {
  teamId: string
  members: TeamMemberDto[]
  currentUserRole: TeamRoleName
  currentUserId: string
}

function initialsOf(member: TeamMemberDto): string {
  const base = member.name?.trim() || member.email
  return base.charAt(0).toUpperCase()
}

export function ClinicMembers({
  teamId,
  members: initialMembers,
  currentUserRole,
  currentUserId,
}: Props) {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMemberDto[]>(initialMembers)
  const [pending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const canManage = currentUserRole === "OWNER" || currentUserRole === "ADMIN"

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormInput>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { role: "MEMBER" },
  })

  function canModifyRow(member: TeamMemberDto): boolean {
    // RBAC: só OWNER/ADMIN gerenciam; nunca o próprio dono, nunca a si mesmo.
    return canManage && member.role !== "OWNER" && member.userId !== currentUserId
  }

  async function onInvite(data: InviteFormInput) {
    setInviteError(null)

    const res = await inviteTeamMemberAction({ teamId, email: data.email, role: data.role })
    if (res.success) {
      reset({ email: "", role: "MEMBER" })
      router.refresh()
    } else {
      setInviteError(res.error)
    }
  }

  function handleRoleChange(member: TeamMemberDto, role: TeamRoleName) {
    if (role === member.role) return
    setRowError(null)
    const previous = members
    setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)))

    startTransition(async () => {
      const res = await updateTeamMemberRoleAction({
        teamId,
        userId: member.userId,
        role: role as "ADMIN" | "MEMBER",
      })
      if (!res.success) {
        setMembers(previous)
        setRowError(res.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleRemove(member: TeamMemberDto) {
    if (!confirm(`Remover ${member.name || member.email} da clínica?`)) return
    setRowError(null)
    const previous = members
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId))

    startTransition(async () => {
      const res = await removeTeamMemberAction(teamId, member.userId)
      if (!res.success) {
        setMembers(previous)
        setRowError(res.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">Profissionais da clínica</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "pessoa" : "pessoas"} com acesso.
          </p>
        </div>
      </div>

      {rowError && (
        <p className="border-b border-destructive/20 bg-destructive/5 px-5 py-2 text-xs text-destructive sm:px-6">
          {rowError}
        </p>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sua clínica ainda está só com você"
          description="Convide colegas para dividir a agenda e acompanhar o financeiro da clínica em um só lugar."
          action={
            canManage ? (
              <Button type="button" onClick={() => setFocus("email")} className="rounded-xl">
                <UserPlus className="h-4 w-4" />
                Convidar profissional
              </Button>
            ) : undefined
          }
        />
      ) : (
      <Stagger className="divide-y divide-border/60">
        {members.map((member) => {
          const editable = canModifyRow(member)
          const isSelf = member.userId === currentUserId
          return (
            <StaggerItem
              key={member.userId}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-care text-sm font-semibold text-white">
                  {initialsOf(member)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.name || "Convite pendente"}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-[3.25rem] sm:pl-0">
                {editable ? (
                  <label className="sr-only" htmlFor={`role-${member.userId}`}>
                    Papel de {member.name || member.email}
                  </label>
                ) : null}
                {editable ? (
                  <select
                    id={`role-${member.userId}`}
                    value={member.role}
                    disabled={pending}
                    onChange={(e) => handleRoleChange(member, e.target.value as TeamRoleName)}
                    className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs font-medium outline-none transition focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30 disabled:opacity-50"
                    aria-label={`Papel de ${member.name || member.email}`}
                  >
                    <option value="MEMBER">{roleLabel("MEMBER")}</option>
                    <option value="ADMIN">{roleLabel("ADMIN")}</option>
                  </select>
                ) : (
                  <RoleBadge role={member.role} />
                )}

                {canModifyRow(member) && (
                  <button
                    type="button"
                    onClick={() => handleRemove(member)}
                    disabled={pending}
                    aria-label={`Remover ${member.name || member.email}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </StaggerItem>
          )
        })}
      </Stagger>
      )}

      {canManage ? (
        <div className="border-t border-border/60 bg-muted/30 px-5 py-5 sm:px-6">
          <h3 className="text-sm font-medium">Convidar profissional</h3>
          <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
            Enviaremos um convite por e-mail para entrar na clínica.
          </p>
          <form
            onSubmit={handleSubmit(onInvite)}
            className="flex flex-col gap-2 sm:flex-row sm:items-start"
          >
            <div className="flex-1">
              <Input
                type="email"
                placeholder="email@profissional.com"
                autoComplete="off"
                className="h-11 rounded-xl"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {(errors.email || inviteError) && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.email?.message ?? inviteError}
                </p>
              )}
            </div>
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/30"
              aria-label="Papel do convidado"
              {...register("role")}
            >
              <option value="MEMBER">{roleLabel("MEMBER")}</option>
              <option value="ADMIN">{roleLabel("ADMIN")}</option>
            </select>
            <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Convidar
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border/60 px-5 py-4 text-xs text-muted-foreground sm:px-6">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Apenas proprietários e administradores podem convidar ou gerenciar profissionais.
        </div>
      )}
    </div>
  )
}
