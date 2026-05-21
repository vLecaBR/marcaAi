import { describe, it, expect, vi, beforeEach } from "vitest"
import { upsertTeamAction, inviteTeamMemberAction, removeTeamMemberAction } from "@/lib/actions/team"
import { prisma } from "@/lib/prisma"

const mockSession = { user: { id: "test-user-id" } }

vi.mock("@/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    team: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    teamMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb({
        team: prisma.team,
        teamMember: prisma.teamMember,
      })
    }),
  },
}))

describe("Team Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("upsertTeamAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await upsertTeamAction({ name: "Team 1", slug: "team-1" })
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se validação falhar", async () => {
      const result = await upsertTeamAction({ name: "", slug: "team-1" })
      expect(result.success).toBe(false)
    })

    it("deve retornar erro se slug já existir globalmente", async () => {
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce({ id: "other" } as any)
      const result = await upsertTeamAction({ name: "Team 1", slug: "team-1" })
      expect(result).toEqual({ success: false, error: "Este slug já está em uso por outra equipe." })
    })

    it("deve criar uma nova equipe caso id não seja fornecido", async () => {
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.team.create).mockResolvedValueOnce({ id: "team-1", slug: "team-1" } as any)
      vi.mocked(prisma.teamMember.create).mockResolvedValueOnce({} as any)

      const result = await upsertTeamAction({ name: "Team 1", slug: "team-1", theme: "DARK" })

      expect(prisma.$transaction).toHaveBeenCalled()
      expect(prisma.team.create).toHaveBeenCalled()
      expect(prisma.teamMember.create).toHaveBeenCalledWith({
        data: { teamId: "team-1", userId: "test-user-id", role: "OWNER" }
      })
      expect(result).toEqual({ success: true, data: { id: "team-1", slug: "team-1" } })
    })

    it("deve retornar erro se não tiver permissão para editar", async () => {
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "MEMBER" } as any)

      const result = await upsertTeamAction({ id: "cuid123456789012345678901", name: "Team 1", slug: "team-1" })
      expect(result).toEqual({ success: false, error: "Sem permissão para editar." })
    })

    it("deve atualizar a equipe caso seja owner", async () => {
      vi.mocked(prisma.team.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any)
      vi.mocked(prisma.team.update).mockResolvedValueOnce({ id: "cuid123456789012345678901", slug: "team-1" } as any)

      const result = await upsertTeamAction({ id: "cuid123456789012345678901", name: "Team 1", slug: "team-1" })

      expect(prisma.team.update).toHaveBeenCalled()
      expect(result).toEqual({ success: true, data: { id: "cuid123456789012345678901", slug: "team-1" } })
    })
  })

  describe("inviteTeamMemberAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await inviteTeamMemberAction({ teamId: "cuid123456789012345678901", email: "test@test.com", role: "MEMBER" })
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se não tiver permissão de ADMIN/OWNER", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "MEMBER" } as any)
      const result = await inviteTeamMemberAction({ teamId: "cuid123456789012345678901", email: "test@test.com", role: "MEMBER" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain("permissão")
    })

    it("deve retornar erro se o usuário convidado não for encontrado", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "ADMIN" } as any) // inviter
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null) // invited user

      const result = await inviteTeamMemberAction({ teamId: "cuid123456789012345678901", email: "test@test.com", role: "MEMBER" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain("encontrado")
    })

    it("deve convidar usuário com sucesso", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "ADMIN" } as any) // inviter
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "invited-user", email: "test@test.com" } as any) // invited
      vi.mocked(prisma.teamMember.create).mockResolvedValueOnce({} as any)

      const result = await inviteTeamMemberAction({ teamId: "cuid123456789012345678901", email: "test@test.com", role: "MEMBER" })

      expect(prisma.teamMember.create).toHaveBeenCalledWith({
        data: { teamId: "cuid123456789012345678901", userId: "invited-user", role: "MEMBER" }
      })
      expect(result).toEqual({ success: true })
    })
  })

  describe("removeTeamMemberAction", () => {
    it("deve retornar erro se não autenticado", async () => {
      // @ts-expect-error - mock
      mockSession.user.id = null
      const result = await removeTeamMemberAction("teamId", "targetId")
      expect(result).toEqual({ success: false, error: "Não autorizado." })
      mockSession.user.id = "test-user-id"
    })

    it("deve retornar erro se equipe não encontrada", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce(null)
      const result = await removeTeamMemberAction("teamId", "targetId")
      expect(result).toEqual({ success: false, error: "Equipe não encontrada." })
    })

    it("deve retornar erro se membro não encontrado", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({} as any) // inviter
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce(null) // target
      const result = await removeTeamMemberAction("teamId", "targetId")
      expect(result).toEqual({ success: false, error: "Membro não encontrado." })
    })

    it("deve remover membro com sucesso", async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any) // inviter
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "MEMBER" } as any) // target
      vi.mocked(prisma.teamMember.delete).mockResolvedValueOnce({} as any)
      const result = await removeTeamMemberAction("teamId", "targetId")
      expect(result).toEqual({ success: true, data: undefined })
    })
  })
})