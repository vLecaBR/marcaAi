import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Calendar, CheckCircle2, Home, Link as LinkIcon, LogOut, Users } from "lucide-react"
import { signOut } from "@/auth"

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Início",
    icon: <Home className="h-5 w-5" />,
  },
  {
    href: "/dashboard/event-types",
    label: "Serviços & Eventos",
    icon: <LinkIcon className="h-5 w-5" />,
  },
  {
    href: "/dashboard/bookings",
    label: "Agendamentos",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    href: "/dashboard/teams",
    label: "Equipes",
    icon: <Users className="h-5 w-5" />,
  },
  {
    href: "/settings/availability",
    label: "Disponibilidade",
    icon: <Calendar className="h-5 w-5" />,
  },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-800/60 bg-[#09090b]">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800/60 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            Marca<span className="text-violet-400">Aí</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-4 py-6">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Menu Principal
          </p>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavItem>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-zinc-800/60 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900/40 px-3 py-3 border border-zinc-800/50">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="h-9 w-9 rounded-full ring-2 ring-zinc-800"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-sm font-medium text-violet-400 ring-2 ring-zinc-800">
                {session.user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {session.user.name}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {session.user.email}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <form action={async () => {
              "use server"
              await signOut()
            }}>
              <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400">
                <LogOut className="h-4 w-4" />
                Sair da conta
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

function NavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        "text-zinc-400 hover:bg-zinc-800/60 hover:text-white hover:bg-zinc-800"
      )}
    >
      <div className="text-zinc-500 transition-colors group-hover:text-violet-400">
        {icon}
      </div>
      {children}
    </Link>
  )
}
