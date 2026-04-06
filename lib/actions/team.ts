"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { teamSchema, inviteMemberSchema, type TeamInput, type InviteMemberInput } from "@/lib/validators/team"
import { revalidatePath } from "next/cache"
import { mapPrismaError } from "@/lib/errors"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Criar / Atualizar Equipe ──────────────────────────────────────────────────

export async function upsertTeamAction(
  raw: TeamInput
): Promise<ActionResult<{ id: string; slug: string }>> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const parsed = teamSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { id, ...data } = parsed.data

  // Verifica unicidade do slug globalmente para times
  const slugConflict = await prisma.team.findFirst({
    where: {
      slug: data.slug,
      NOT: id ? { id } : undefined,
    },
  })

  if (slugConflict) {
    return { success: false, error: "Este slug já está em uso por outra equipe." }
  }

  if (id) {
    // Atualização (verifica se é owner ou admin)
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: id, userId: session.user.id } }
    })
    
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
      return { success: false, error: "Sem permissão para editar." }
    }

    const team = await prisma.team.update({
      where: { id },
      data,
      select: { id: true, slug: true }
    })
    revalidatePath("/dashboard/teams")
    return { success: true, data: team }
  } else {
    // Criação
    const team = await prisma.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data,
        select: { id: true, slug: true }
      })

      await tx.teamMember.create({
        data: {
          teamId: newTeam.id,
          userId: session.user.id,
          role: "OWNER"
        }
      })

      return newTeam
    })
    
    revalidatePath("/dashboard/teams")
    return { success: true, data: team }
  }
}

// ── Convidar Membro ───────────────────────────────────────────────────────────

export async function inviteTeamMemberAction(
  raw: InviteMemberInput
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  const parsed = inviteMemberSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { teamId, email, role } = parsed.data

  // Verifica permissão de quem convida
  const inviter = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: session.user.id } }
  })
  
  if (!inviter || (inviter.role !== "OWNER" && inviter.role !== "ADMIN")) {
    return { success: false, error: "Sem permissão para convidar." }
  }

  // Acha o usuário pelo email
  const targetUser = await prisma.user.findUnique({
    where: { email }
  })

  if (!targetUser) {
    // Em um sistema completo, criaríamos um convite pendente por email
    // Para simplificar, exigimos que o usuário já tenha conta
    return { success: false, error: "Usuário com este e-mail não encontrado na plataforma." }
  }

  if (targetUser.id === session.user.id) {
    return { success: false, error: "Você não pode convidar a si mesmo." }
  }

  try {
    await prisma.teamMember.create({
      data: {
        teamId,
        userId: targetUser.id,
        role: role as "ADMIN" | "MEMBER"
      }
    })
    revalidatePath(`/dashboard/teams/${teamId}`)
    return { success: true, data: undefined }
  } catch (err: unknown) {
    const message = mapPrismaError(err, "Erro ao adicionar membro.")
    if (message === "Registro já existente. Este valor já está em uso.") {
      return { success: false, error: "Este usuário já está na equipe." }
    }
    return { success: false, error: message }
  }
}

// ── Remover Membro ────────────────────────────────────────────────────────────

export async function removeTeamMemberAction(
  teamId: string,
  targetUserId: string
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado." }

  // Verifica permissão de quem remove
  const inviter = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: session.user.id } }
  })
  
  if (!inviter) return { success: false, error: "Equipe não encontrada." }

  const targetMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } }
  })

  if (!targetMember) return { success: false, error: "Membro não encontrado." }

  // Owner pode remover qualquer um. Admin pode remover members, mas não owners ou admins.
  if (
    inviter.role === "MEMBER" && session.user.id !== targetUserId || 
    (inviter.role === "ADMIN" && targetMember.role === "OWNER") ||
    (inviter.role === "ADMIN" && targetMember.role === "ADMIN" && session.user.id !== targetUserId)
  ) {
    return { success: false, error: "Sem permissão para remover este membro." }
  }

  // Não pode deixar sem owner
  if (targetMember.role === "OWNER" && session.user.id === targetUserId) {
    const otherOwners = await prisma.teamMember.count({
      where: { teamId, role: "OWNER", userId: { not: session.user.id } }
    })
    if (otherOwners === 0) {
      return { success: false, error: "Você é o único dono. Exclua a equipe ou passe a posse antes." }
    }
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId: targetUserId } }
  })

  revalidatePath(`/dashboard/teams/${teamId}`)
  return { success: true, data: undefined }
}