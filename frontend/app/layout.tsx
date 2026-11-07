import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { cn } from "@/lib/utils"
import { MotionProvider } from "@/components/motion/provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "MarcaAí", template: "%s | MarcaAí" },
  description: "Agendamento e pagamento para profissionais de saúde.",
  openGraph: {
    type: "website",
    siteName: "MarcaAí",
    title: "MarcaAí — agenda online para profissionais de saúde",
    description: "Seus pacientes agendam pelo seu link, com lembretes automáticos e consentimento LGPD.",
    locale: "pt_BR",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem bloquear zoom: acessibilidade (§4.3) permite ampliação pelo usuário.
  themeColor: "#0f9e8e",
}

/**
 * Root layout. A sessão NÃO é mais resolvida aqui (NextAuth descartado — ADR-0001):
 * cada segmento protegido consulta a API via guardas (`lib/auth/guards.ts`).
 * `MotionProvider` habilita as micro-interações leves (LazyMotion) em toda a árvore.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          geistMono.variable,
        )}
      >
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
      </body>
    </html>
  )
}
