import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { Input } from "@/components/ui/input"
import { NavLink } from "@/components/dashboard/nav-link"
import { DevNav } from "@/components/dashboard/dev-nav"
import { NotificationButton } from "@/components/dashboard/notification-button"
import { LogoutButton } from "@/components/dashboard/logout-button"
import { FadeIn } from "@/components/motion/primitives"
import { TrialBanner } from "@/components/billing/trial-banner"
import { CheckoutIntentRunner } from "@/components/billing/checkout-intent-runner"
import { requireOnboarded } from "@/lib/auth/guards"
import { getPrimaryTeamBilling } from "@/lib/api/billing"
import { isClinicPlan } from "@/lib/plans/plan-config"
import type { MeDto } from "@/lib/api/types"
import {
  Home,
  Calendar,
  Layers,
  Users,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  Clock,
  Search,
  ChevronDown,
  CreditCard,
  ShieldCheck,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Nome de exibição e iniciais derivados do `MeDto` (nome real → handle → e-mail como fallback). */
function display(user: MeDto): { name: string; initials: string } {
  const name = user.name ?? user.username ?? user.email.split("@")[0]
  return { name, initials: name.charAt(0).toUpperCase() || "U" }
}

function UserDropdown({ user, mobile = false }: { user: MeDto; mobile?: boolean }) {
  const { name, initials } = display(user)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-3 rounded-lg outline-none transition hover:bg-muted ${
            mobile ? "p-1" : "w-full px-3 py-2"
          }`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-care text-xs font-semibold text-white">
            {initials}
          </div>
          {!mobile && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
              <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Bug 2: entrada de planos acessível no header mobile (a bottom nav está lotada) e no rodapé desktop. */}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/plans" className="cursor-pointer">
            <CreditCard className="mr-2 h-4 w-4" />
            Planos e assinatura
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="p-1">
          <LogoutButton />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Layout protegido do dashboard. Guarda de rota via `requireOnboarded()` (policy `Onboarded`):
 * sem sessão → /login; sem onboarding → /onboarding. NextAuth foi descartado (ADR-0001).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireOnboarded()
  // Estado de trial da clínica principal (com fallback mock gracioso §2.4) para o banner persistente.
  const { billing } = await getPrimaryTeamBilling()
  // Q2 (gating de trilha): o bloco "Clínica" só aparece para planos da trilha clínica
  // (CLINICA/CLINICA_PRO). Solo/Solo Pro não têm contato com o escopo de clínica.
  const showClinic = isClinicPlan(billing.planCode)

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row dark:bg-background">
      {/* Q8: dispara o checkout do plano retido logo após o onboarding/login. */}
      <CheckoutIntentRunner primaryTeamId={billing.teamId} />
      {/* Header mobile */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/60 bg-card px-4 md:hidden">
        <Logo size={22} />
        <div className="flex items-center gap-3">
          <NotificationButton />
          <UserDropdown user={user} mobile />
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card md:flex">
        <div className="border-b border-border/60 p-5">
          <Logo size={22} />
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-0.5">
            <NavLink href="/dashboard" icon={<Home />} exact>Início</NavLink>
            <NavLink href="/dashboard/bookings" icon={<Calendar />}>Meus agendamentos</NavLink>
            <NavLink href="/dashboard/event-types" icon={<Layers />}>Tipos de consulta</NavLink>
            <NavLink href="/dashboard/recebimentos" icon={<Wallet />}>Recebimentos</NavLink>
            <NavLink href="/dashboard/financeiro" icon={<BarChart3 />}>Financeiro</NavLink>
            {showClinic && (
              <NavLink href="/dashboard/team" icon={<Users />}>Clínica</NavLink>
            )}
          </div>

          <div
            className="mt-6 mb-2 px-3 text-xs tracking-wider text-muted-foreground uppercase"
            style={{ fontWeight: 600 }}
          >
            Configurações
          </div>
          <div className="space-y-0.5">
            {/* Bug 2: ponto de entrada sempre visível para a tela neutra de planos (não condicionar a clínica). */}
            <NavLink href="/dashboard/plans" icon={<CreditCard />}>Planos e assinatura</NavLink>
            <NavLink href="/settings/profile" icon={<SettingsIcon />}>Perfil</NavLink>
            <NavLink href="/settings/availability" icon={<Clock />}>Disponibilidade</NavLink>
            <NavLink href="/settings/privacy" icon={<ShieldCheck />}>Privacidade</NavLink>
          </div>
        </nav>

        <div className="border-t border-border/60 p-3">
          <UserDropdown user={user} />
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-10 hidden h-16 items-center justify-between border-b border-border/60 bg-card px-6 md:flex">
          <div className="relative w-80 max-w-full">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar consultas, pacientes…" className="h-10 rounded-xl border-0 bg-muted/50 pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <NotificationButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          <TrialBanner billing={billing} />
          <FadeIn>{children}</FadeIn>
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="pb-safe fixed right-0 bottom-0 left-0 z-20 flex h-[68px] items-center justify-around border-t border-border/60 bg-card px-2 md:hidden">
        <NavLink href="/dashboard" icon={<Home />} exact variant="mobile">Início</NavLink>
        <NavLink href="/dashboard/bookings" icon={<Calendar />} variant="mobile">Agenda</NavLink>
        <NavLink href="/dashboard/event-types" icon={<Layers />} variant="mobile">Consultas</NavLink>
        <NavLink href="/dashboard/recebimentos" icon={<Wallet />} variant="mobile">Recebe</NavLink>
        {showClinic && (
          <NavLink href="/dashboard/team" icon={<Users />} variant="mobile">Clínica</NavLink>
        )}
        <NavLink href="/settings/profile" icon={<SettingsIcon />} variant="mobile">Ajustes</NavLink>
      </nav>

      <DevNav />
    </div>
  )
}
