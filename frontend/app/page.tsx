import { redirect } from "next/navigation"
import { LegalFooter } from "@/components/marketing/legal-footer"
import Link from "next/link"
import { getMe } from "@/lib/api/session"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import { PricingSection } from "@/components/marketing/pricing-section"
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  Users,
  Stethoscope,
  ShieldCheck,
  Wallet,
  CheckCircle2,
  HeartPulse,
} from "lucide-react"

/** Calendário ilustrativo da landing: sempre o mês corrente, com dias úteis "livres" a partir de hoje. */
function buildMock() {
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth()
  const days = new Date(y, mo + 1, 0).getDate()
  const offset = new Date(y, mo, 1).getDay()
  const open: number[] = []
  for (let d = now.getDate() + 1; d <= days; d++) {
    const wd = new Date(y, mo, d).getDay()
    if (wd >= 1 && wd <= 5) open.push(d)
  }
  const selected = open[0] ?? now.getDate()
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("pt-BR", o).format(d)
  return {
    days, offset, open, selected,
    monthLabel: fmt({ month: "long", year: "numeric" }, now),
    selectedLabel: fmt({ weekday: "short", day: "numeric", month: "short" }, new Date(y, mo, selected)).replace(".", ""),
  }
}

export const revalidate = 3600

export default async function RootPage() {
  const mock = buildMock()
  const me = await getMe()

  if (me) {
    if (!me.onboarded) redirect("/onboarding")
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-secondary/50 via-surface to-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a className="hover:text-foreground transition" href="#features">Recursos</a>
            <a className="hover:text-foreground transition" href="#pricing">Planos</a>
            <a className="hover:text-foreground transition" href="#trust">Segurança</a>
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
          <Badge
            variant="secondary"
            className="mb-6 rounded-full px-3 py-1 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/10 border-0 font-medium"
          >
            <HeartPulse size={12} className="mr-1.5" />
            Feito para clínicas e consultórios
          </Badge>
          <h1 className="mx-auto max-w-3xl" style={{ fontSize: 56, lineHeight: 1.05, fontWeight: 700, letterSpacing: -1.5 }}>
            A agenda da sua clínica,{" "}
            <span className="bg-linear-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
              organizada e segura
            </span>
          </h1>
          <p className="mx-auto max-w-xl mt-6 text-muted-foreground" style={{ fontSize: 18, lineHeight: 1.6 }}>
            Seus pacientes agendam e pagam pelo seu link. Você recebe com repasse transparente, sem
            trocas de mensagens, ligações perdidas ou horários em conflito.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-7 rounded-xl w-full sm:w-auto">
              <Link href="/login">Começar grátis 30 dias por nossa conta</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 rounded-xl w-full sm:w-auto">
              <Link href="#features">Conheça os recursos</Link>
            </Button>
          </div>
          <div className="mt-5 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-care" /> Sem cartão de crédito</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-care" /> Dados de pacientes protegidos</span>
          </div>

          {/* Mock app preview */}
          <div className="mt-16 relative hidden md:block">
            <div className="absolute -inset-4 bg-linear-to-r from-brand-primary/20 via-brand-secondary/15 to-brand-primary/20 blur-3xl rounded-[40px]" />
            <Card aria-hidden="true" className="relative mx-auto max-w-4xl overflow-hidden border-border/60 shadow-2xl rounded-2xl p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 bg-card">
                <div className="p-6 border-r border-border/60 text-left">
                  <div className="w-12 h-12 rounded-full bg-brand-primary/10 mb-4 flex items-center justify-center text-brand-primary font-semibold">
                    AC
                  </div>
                  <div className="text-xs text-muted-foreground">Dra. Ana Costa</div>
                  <h3 className="mt-1 font-semibold">Consulta de retorno</h3>
                  <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Clock size={14} /> 30 minutos
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                    <Stethoscope size={14} /> Presencial · Consultório
                  </div>
                </div>
                <div className="p-6 border-r border-border/60 text-left">
                  <div className="text-sm mb-3 capitalize" style={{ fontWeight: 600 }}>{mock.monthLabel}</div>
                  <div className="grid grid-cols-7 gap-1.5 text-xs">
                    {["D","S","T","Q","Q","S","S"].map((d,i) => <div key={i} className="text-center text-muted-foreground py-1 font-medium">{d}</div>)}
                    {Array.from({length: mock.offset}).map((_,i) => <div key={`o${i}`} />)}
                    {Array.from({length: mock.days}).map((_,i) => (
                      <div key={i} className={`aspect-square rounded-md flex items-center justify-center transition-colors ${i+1===mock.selected?"bg-primary text-primary-foreground shadow-sm":mock.open.includes(i+1)?"hover:bg-secondary cursor-pointer text-foreground":"text-muted-foreground"}`}>
                        {i+1}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-6 text-left">
                  <div className="text-sm mb-3 capitalize" style={{ fontWeight: 600 }}>{mock.selectedLabel}</div>
                  <div className="flex flex-col gap-2">
                    {["09:00","09:30","10:00","14:00"].map((t,i) => (
                      <div key={t} className={`px-3 py-2.5 rounded-lg border text-sm text-center transition-colors ${i===2?"border-primary bg-secondary text-primary":"border-border hover:border-primary/50 text-foreground"}`}>
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
              Tudo para a rotina da clínica. Nada de excessos.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: CalendarCheck, title: "Agenda sem conflitos", desc: "Regras de disponibilidade por profissional, intervalos e antecedência mínima. Cada horário aberto só uma vez." },
              { icon: Users, title: "Equipe da clínica", desc: "Vários profissionais, papéis e permissões. Cada um com sua agenda, tudo sob o mesmo consultório." },
              { icon: Wallet, title: "Recebimento transparente", desc: "Pacientes pagam via PIX ou cartão no agendamento. Repasse e taxas sempre à vista, sem surpresa." },
              { icon: Stethoscope, title: "Tipos de consulta", desc: "Retorno, primeira consulta, avaliação cada um com sua duração, valor e modalidade." },
              { icon: ShieldCheck, title: "Segurança em primeiro lugar", desc: "Dados dos pacientes protegidos, usados só para a consulta e nunca vendidos." },
              { icon: Clock, title: "Lembretes automáticos", desc: "Confirmações e lembretes reduzem faltas e mantêm a agenda cheia sem trabalho manual." },
            ].map((f) => (
              <Card key={f.title} className="p-6 rounded-2xl border-border/60 hover:shadow-md hover:-translate-y-0.5 transition group">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4 group-hover:scale-110 transition-transform">
                  <f.icon size={18} />
                </div>
                <h3 className="mb-1.5 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.55 }}>{f.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing (§8.1 — consome PLAN_CONFIG) */}
        <PricingSection />

        {/* Trust / Healthtech (§8.5.2) */}
        <section id="trust" className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { icon: ShieldCheck, title: "Privacidade desde o projeto", desc: "Coletamos só o necessário, com consentimento do paciente, e você pode exportar ou anonimizar dados quando precisar." },
              { icon: Wallet, title: "Split transparente", desc: "Você vê o valor bruto, a taxa e o líquido de cada consulta. Sem letra miúda." },
              { icon: HeartPulse, title: "Feito para clínicas", desc: "Da agenda ao repasse, pensado para a rotina de consultórios e equipes de saúde." },
            ].map((t) => (
              <div key={t.title} className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-brand-secondary/10 flex items-center justify-center text-brand-secondary mb-4">
                  <t.icon size={18} />
                </div>
                <h3 className="mb-1.5 font-semibold">{t.title}</h3>
                <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.55 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <Card className="rounded-3xl bg-linear-to-br from-brand-primary to-brand-secondary border-0 p-8 sm:p-12 text-center text-white overflow-hidden relative shadow-lg">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,white,transparent_50%)] pointer-events-none" />
            <div className="relative">
              <h2 className="text-white" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>Sua clínica, no controle da agenda.</h2>
              <p className="mt-3 text-white/85 max-w-md mx-auto">Junte-se a profissionais de saúde que agendam, recebem e crescem com o MarcaAí.</p>
              <Button asChild size="lg" variant="secondary" className="mt-7 h-12 px-7 rounded-xl text-brand-primary font-medium hover:bg-white/90">
                <Link href="/login">Criar conta grátis 30 dias</Link>
              </Button>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 bg-card">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} MarcaAí. Todos os direitos reservados.</span>
        </div>
        <div className="max-w-6xl mx-auto px-6 mt-4"><LegalFooter /></div>
      </footer>
    </div>
  )
}
