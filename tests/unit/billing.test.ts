import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCheckoutSessionAction } from "@/lib/actions/billing"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/payments/stripe"

const mockSession = { user: { id: "test-user-id", email: "test@test.com" } }

vi.mock("@/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    teamMember: {
      findUnique: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock("@/lib/payments/stripe", () => ({
  stripe: {
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
  STRIPE_PRO_PRICE_ID: "price_123",
}))

describe("Billing Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  })

  it("deve retornar erro se não autenticado", async () => {
    // @ts-expect-error - mock
    mockSession.user.id = null
    const result = await createCheckoutSessionAction("team-1")
    expect(result).toEqual({ error: "Unauthorized" })
    mockSession.user.id = "test-user-id"
  })

  it("deve retornar erro se não for dono da equipe", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "MEMBER" } as any)
    const result = await createCheckoutSessionAction("team-1")
    expect(result).toEqual({ error: "Apenas o dono da equipe pode assinar planos." })
  })

  it("deve retornar erro se a equipe não existir", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any)
    vi.mocked(prisma.team.findUnique).mockResolvedValueOnce(null)
    const result = await createCheckoutSessionAction("team-1")
    expect(result).toEqual({ error: "Equipe não encontrada." })
  })

  it("deve redirecionar para o portal caso já tenha assinado", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any)
    vi.mocked(prisma.team.findUnique).mockResolvedValueOnce({
      id: "team-1",
      subscription: { stripeCustomerId: "cus_123" },
    } as any)

    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValueOnce({ url: "https://portal.stripe.com" } as any)

    const result = await createCheckoutSessionAction("team-1")
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/dashboard/teams/team-1",
    })
    expect(result).toEqual({ url: "https://portal.stripe.com" })
  })

  it("deve criar sessão de checkout se for primeira assinatura", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any)
    vi.mocked(prisma.team.findUnique).mockResolvedValueOnce({ id: "team-1", subscription: null } as any)

    vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({ url: "https://checkout.stripe.com" } as any)

    const result = await createCheckoutSessionAction("team-1")
    expect(stripe.checkout.sessions.create).toHaveBeenCalled()
    expect(result).toEqual({ url: "https://checkout.stripe.com" })
  })

  it("deve tratar erro do stripe ao gerar link", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValueOnce({ role: "OWNER" } as any)
    vi.mocked(prisma.team.findUnique).mockResolvedValueOnce({ id: "team-1", subscription: null } as any)
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValueOnce(new Error("Stripe Error"))

    const result = await createCheckoutSessionAction("team-1")
    expect(result).toEqual({ error: "Falha ao gerar o link de pagamento." })
  })
})