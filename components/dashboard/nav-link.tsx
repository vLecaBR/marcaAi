"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function NavLink({ 
  href, 
  icon: Icon, 
  children, 
  exact = false,
  variant = "desktop"
}: { 
  href: string
  icon: any
  children: React.ReactNode
  exact?: boolean
  variant?: "desktop" | "mobile" 
}) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        className={cn(
          "flex flex-col items-center justify-center w-full py-2 text-[10px] font-medium transition",
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon size={20} className={cn("mb-1", isActive ? "text-primary" : "")} />
        <span className="truncate w-full text-center">{children}</span>
      </Link>
    )
  }

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