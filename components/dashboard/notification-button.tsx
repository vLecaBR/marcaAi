"use client"

import { Bell } from "lucide-react"
import { toast } from "sonner"

export function NotificationButton() {
  function handleClick() {
    toast.info("Você não tem novas notificações no momento.")
  }

  return (
    <button 
      onClick={handleClick}
      title="Notificações"
      className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition relative"
    >
      <Bell size={18} />
      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
    </button>
  )
}
