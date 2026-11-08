import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

dotenv.config({ path: ".env.test" })

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Sobe a API .NET (Development, usa o Postgres do docker-compose.dev.yml) e o Next. Reaproveita se já estiverem no ar.
  webServer: [
    {
      command: "dotnet run --project ../backend/src/MarcaAi.Api --urls http://localhost:5080",
      url: "http://localhost:5080/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000,
      env: {
        ASPNETCORE_ENVIRONMENT: "Development",
        // Os user-secrets do dev podem ter Resend real: força e-mail LOCAL (Mailpit) para o E2E nunca enviar e-mail de verdade.
        Resend__ApiKey: "",
        Smtp__Host: "localhost",
        Smtp__Port: "1025",
        // Pagamento SIMULADO (só dev/teste): permite a jornada paga offline, sem conta Stripe.
        Payments__Provider: "Fake",
        // Todas as requisições do E2E vêm do mesmo IP: sem isto o rate limit real (15 agendamentos/10 min) derruba execuções repetidas.
        RateLimit__Multiplier: "50",
      },
    },
    {
      // E2E_DEV=1 usa `next dev` (HMR; lento e instável para E2E). O padrão é o BUILD DE PRODUÇÃO (`next build` + `next start`),
      // que é o que vai ao ar: sem recompilação por rota e sem Fast Refresh abortando navegações.
      command: process.env.E2E_DEV ? "npm run dev -- --webpack" : "npm run build && npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 360 * 1000,
      env: {
        NEXT_PUBLIC_API_URL: "http://localhost:5080",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        // O build de produção lê o aviso do encarregado em tempo de build (páginas estáticas).
        DPO_EMAIL: "dpo@marcaai.test",
      },
    },
  ],
})
