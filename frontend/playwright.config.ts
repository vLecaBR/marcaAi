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
      },
    },
    {
      command: "npm run dev -- --webpack",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
