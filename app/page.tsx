import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import {
  ArrowRight,
  Calendar,
  Clock,
  Users,
  Zap,
  Shield,
  Globe,
  CheckCircle2,
  Sparkles,
} from "lucide-react"

export default async function RootPage() {
  const session = await auth()

  if (session?.user) {
    if (!session.user.onboarded) redirect("/onboarding")
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-violet-50/40 via-white to-white dark:from-violet-950/20 dark:via-background dark:to-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 dark:bg-background/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a className="hover:text-foreground transition" href="#features">Recursos</a>
            <a className="hover:text-foreground transition" href="#pricing">Planos</a>
            <a className="hover:text-foreground transition" href="#faq">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Começar agora <ArrowRight className="ml-1" size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <Badge variant="secondary" className="mb-6 rounded-full px-3 py-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 hover:bg-violet-100 border-0 font-normal">
            <Sparkles size={12} className="mr-1.5" />
            Novo · Assistente de agenda com IA
          </Badge>
          <h1 className="mx-auto max-w-3xl" style={{ fontSize: 56, lineHeight: 1.05, fontWeight: 700, letterSpacing: -1.5 }}>
            Agendamentos que parecem{" "}
            <span className="bg-linear-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              mágica
            </span>
          </h1>
          <p className="mx-auto max-w-xl mt-6 text-muted-foreground" style={{ fontSize: 18, lineHeight: 1.6 }}>
            Compartilhe seu link. Deixe que escolham um horário. Sem trocas infinitas de email, ligações perdidas ou conflitos de agenda.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-7 rounded-xl w-full sm:w-auto">
              <Link href="/login">Começar grátis — é por nossa conta</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 rounded-xl w-full sm:w-auto">
              <Link href="#features">Conheça os recursos</Link>
            </Button>
          </div>
          <div className="mt-5 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> Sem cartão de crédito</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-500" /> Plano grátis para sempre</span>
          </div>

          {/* Mock app preview */}
          <div className="mt-16 relative hidden md:block">
            <div className="absolute -inset-4 bg-linear-to-r from-violet-200/40 via-fuchsia-200/40 to-violet-200/40 dark:from-violet-900/20 dark:via-fuchsia-900/20 dark:to-violet-900/20 blur-3xl rounded-[40px]" />
            <Card className="relative mx-auto max-w-4xl overflow-hidden border-border/60 shadow-2xl rounded-2xl p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 bg-card">
                <div className="p-6 border-r border-border/60 text-left">
                  <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-4 flex items-center justify-center text-violet-700 font-semibold">
                    AC
                  </div>
                  <div className="text-xs text-muted-foreground">Ana Costa</div>
                  <h3 className="mt-1 font-semibold">Conversa de estratégia</h3>
                  <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Clock size={14} /> 30 minutos
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                    <Globe size={14} /> Google Meet
                  </div>
                </div>
                <div className="p-6 border-r border-border/60 text-left">
                  <div className="text-sm mb-3" style={{ fontWeight: 600 }}>Maio 2026</div>
                  <div className="grid grid-cols-7 gap-1.5 text-xs">
                    {["D","S","T","Q","Q","S","S"].map((d,i) => <div key={i} className="text-center text-muted-foreground py-1 font-medium">{d}</div>)}
                    {Array.from({length: 31}).map((_,i) => (
                      <div key={i} className={`aspect-square rounded-md flex items-center justify-center transition-colors ${i===14?"bg-primary text-primary-foreground shadow-sm":[2,8,14,15,21,22,28].includes(i)?"hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer text-foreground":"text-muted-foreground/30"}`}>
                        {i+1}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-6 text-left">
                  <div className="text-sm mb-3" style={{ fontWeight: 600 }}>Qui, 15 de mai</div>
                  <div className="flex flex-col gap-2">
                    {["09:00","09:30","10:00","14:00"].map((t,i) => (
                      <div key={t} className={`px-3 py-2.5 rounded-lg border text-sm text-center transition-colors ${i===2?"border-primary bg-violet-50 dark:bg-violet-900/10 text-primary":"border-border hover:border-primary/50 text-foreground"}`}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge variant="outline" className="mb-4 rounded-full font-normal">Recursos</Badge>
            <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.8 }}>
              Tudo que você precisa. Nada que você não precisa.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: Calendar, title: "Sincronização inteligente", desc: "Conecta com Google, Outlook e iCloud. Nunca mais tenha conflitos de horário." },
              { icon: Users, title: "Agenda em equipe", desc: "Round-robin, coletivos e eventos gerenciados para todo o seu time." },
              { icon: Zap, title: "Fluxos e lembretes", desc: "Automatize confirmações, follow-ups e lembretes por email ou WhatsApp." },
              { icon: Globe, title: "Embed em qualquer lugar", desc: "Inclua no seu site, em emails ou compartilhe um link público elegante." },
              { icon: Shield, title: "Privacidade em primeiro lugar", desc: "Em conformidade com a LGPD. SOC 2. Nunca vendemos seus dados." },
              { icon: Clock, title: "Disponibilidade customizada", desc: "Regras por evento. Intervalos, antecedência mínima, datas e muito mais." },
            ].map((f) => (
              <Card key={f.title} className="p-6 rounded-2xl border-border/60 hover:shadow-md hover:-translate-y-0.5 transition group">
                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-700 dark:text-violet-400 mb-4 group-hover:scale-110 transition-transform">
                  <f.icon size={18} />
                </div>
                <h3 className="mb-1.5 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.55 }}>{f.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <Card className="rounded-3xl bg-linear-to-br from-violet-600 to-fuchsia-600 border-0 p-8 sm:p-12 text-center text-white overflow-hidden relative shadow-lg">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,white,transparent_50%)] pointer-events-none" />
            <div className="relative">
              <h2 className="text-white" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>Seu tempo, suas regras.</h2>
              <p className="mt-3 text-white/85 max-w-md mx-auto">Junte-se a dezenas de profissionais que agendam de forma inteligente com a Marca AI.</p>
              <Button asChild size="lg" variant="secondary" className="mt-7 h-12 px-7 rounded-xl text-primary font-medium hover:bg-white/90">
                <Link href="/login">Criar minha conta grátis</Link>
              </Button>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 bg-card">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Marca AI. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  )
}