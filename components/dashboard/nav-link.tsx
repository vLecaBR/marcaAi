"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function NavLink({ 
  href, 
  icon: Icon, 
  children, 
  exact = false 
}: { 
  href: string
  icon: any
  children: React.ReactNode
  exact?: boolean 
}) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
        isActive
          ? "bg-violet-50 text-primary dark:bg-violet-500/10 dark:text-violet-400"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon size={16} />
      {children}
    </Link>
  )
}