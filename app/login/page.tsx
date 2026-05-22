import { Metadata } from "next"
import { signIn } from "@/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/ui/logo"
import { Mail } from "lucide-react"

export const metadata: Metadata = {
  title: "Entrar",
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md p-10 rounded-2xl shadow-xl border-border/60">
          <div className="flex justify-center mb-7">
            <Logo />
          </div>
          <h1 className="text-center" style={{ fontSize: 24, fontWeight: 600 }}>
            Bem-vindo
          </h1>
          <p className="text-center text-sm text-muted-foreground mt-1.5">
            Entre para gerenciar sua agenda
          </p>

          <div className="mt-8 space-y-2.5">
            <form
              action={async () => {
                "use server"
                await signIn("google")
              }}
            >
              <Button type="submit" variant="outline" className="w-full h-11 rounded-xl gap-2.5">
                <GoogleIcon /> Continuar com Google
              </Button>
            </form>
          </div>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">OU</span>
            <Separator className="flex-1" />
          </div>

          <form
            action={async (formData) => {
              "use server"
              await signIn("resend", formData)
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="email" className="text-sm">Email corporativo</label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="voce@empresa.com"
                className="mt-1.5 h-11 rounded-xl"
              />
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl gap-2">
              <Mail size={16} /> Enviar link mágico
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Ao continuar, você concorda com nossos <a href="/termos" className="underline">Termos de Uso</a> e <a href="/privacidade" className="underline">Política de Privacidade</a>.
          </p>
        </Card>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.27-4.74 3.27-8.33z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.67l-3.56-2.77c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
