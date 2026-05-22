import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Input } from "@/components/ui/input"
import { NavLink } from "@/components/dashboard/nav-link"
import { DevNav } from "@/components/dashboard/dev-nav"
import {
  Home,
  Calendar,
  Layers,
  Users,
  Settings as SettingsIcon,
  Clock,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  Menu
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function UserDropdown({ session, userInitials, mobile = false }: { session: any, userInitials: string, mobile?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`flex items-center gap-3 rounded-lg hover:bg-muted transition outline-none ${mobile ? 'p-1' : 'w-full px-3 py-2'}`}>
          {session.user.image ? (
            <img src={session.user.image} alt="User" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-semibold">
              {userInitials}
            </div>
          )}
          {!mobile && (
            <>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm truncate font-medium">{session.user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{session.user.email}</div>
              </div>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={async () => {
          "use server"
          await signOut()
        }}>
          <button type="submit" className="w-full">
            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sair</span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const userInitials = session.user.name?.[0]?.toUpperCase() ?? "U"

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col md:flex-row">
      
      {/* Mobile Header (Top) */}
      <header className="md:hidden h-16 bg-card border-b border-border/60 px-4 flex items-center justify-between sticky top-0 z-20">
        <Logo size={22} />
        <div className="flex items-center gap-3">
          <button className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition relative">
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
          </button>
          <UserDropdown session={session} userInitials={userInitials} mobile={true} />
        </div>
      </header>

      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border/60 flex-col sticky top-0 h-screen shrink-0">
        <div className="p-5 border-b border-border/60">
          <Logo size={22} />
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-0.5">
            <NavLink href="/dashboard" icon={<Home />} exact>Início</NavLink>
            <NavLink href="/dashboard/bookings" icon={<Calendar />}>Meus agendamentos</NavLink>
            <NavLink href="/dashboard/event-types" icon={<Layers />}>Tipos de eventos</NavLink>
            <NavLink href="/dashboard/teams" icon={<Users />}>Equipes</NavLink>
          </div>

          <div className="mt-6 mb-2 px-3 text-xs text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>
            Configurações
          </div>
          <div className="space-y-0.5">
            <NavLink href="/settings/profile" icon={<SettingsIcon />}>Perfil</NavLink>
            <NavLink href="/settings/availability" icon={<Clock />}>Disponibilidade</NavLink>
          </div>
        </nav>

        <div className="p-3 border-t border-border/60">
          <UserDropdown session={session} userInitials={userInitials} />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        {/* Desktop Header */}
        <header className="hidden md:flex h-16 bg-card border-b border-border/60 px-6 items-center justify-between sticky top-0 z-10">
          <div className="relative w-80 max-w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar agendamentos, eventos…" className="pl-9 h-10 rounded-xl bg-muted/50 border-0" />
          </div>
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition relative">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[68px] bg-card border-t border-border/60 flex items-center justify-around px-2 z-20 pb-safe">
        <NavLink href="/dashboard" icon={<Home />} exact variant="mobile">Início</NavLink>
        <NavLink href="/dashboard/bookings" icon={<Calendar />} variant="mobile">Agenda</NavLink>
        <NavLink href="/dashboard/event-types" icon={<Layers />} variant="mobile">Eventos</NavLink>
        <NavLink href="/dashboard/teams" icon={<Users />} variant="mobile">Equipes</NavLink>
        <NavLink href="/settings/profile" icon={<SettingsIcon />} variant="mobile">Ajustes</NavLink>
      </nav>
      
      {/* Development Navigation Tool */}
      <DevNav />
    </div>
  )
}