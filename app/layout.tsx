import type { Metadata } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import { cn } from "@/lib/utils"
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
  title: { default: "People OS", template: "%s | People OS" },
  description: "Agendamento inteligente para profissionais de alto padrão.",
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
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}