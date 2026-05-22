import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { auth } from "@/auth"
import { cn } from "@/lib/utils"
import { AuthProvider } from "@/components/auth-provider"
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
  title: { default: "Marca AI", template: "%s | Marca AI" },
  description: "Agendamento inteligente para profissionais de alto padrão.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          geistMono.variable
        )}
      >
        <AuthProvider session={session}>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  )
}