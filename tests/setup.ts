import "@testing-library/jest-dom"
import { vi } from "vitest"

// Mock do next/navigation e next/headers essenciais para o App Router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
  }),
  headers: () => new Map(),
}))

// Mock global do Auth.js (NextAuth) para testar os componentes de forma limpa
vi.mock("@/auth", () => ({
  auth: vi.fn(() => ({
    user: { id: "test-user-id", name: "Test User", email: "test@example.com", onboarded: true },
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// Mock global para serviços externos (Evitar chamadas reais no CI)
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "mock-resend-id" }, error: null }),
    },
  })),
}))

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://mock-stripe-url.com" }),
      },
    },
  })),
}))

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: vi.fn(),
  Payment: vi.fn(() => ({
    create: vi.fn().mockResolvedValue({ id: 123456, point_of_interaction: { transaction_data: { qr_code_base64: "mock", qr_code: "mock", ticket_url: "mock" } } }),
  })),
}))

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      events: {
        insert: vi.fn().mockResolvedValue({ data: { id: "mock-event-id", htmlLink: "https://mock-meet.com" } }),
      },
    })),
  },
}))
