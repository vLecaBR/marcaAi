"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CopyLinkButton({ link }: { link: string }) {
  function handleCopy() {
    if (!link) {
      toast.error("Configure seu perfil primeiro para ter um link.")
      return
    }
    
    // Try to use the actual current domain, otherwise fallback to the provided link
    const pathSegments = link.split('/')
    const path = pathSegments.length > 1 ? pathSegments.slice(1).join('/') : link
    const absoluteUrl = typeof window !== "undefined" ? `${window.location.origin}/${path}` : `https://${link}`
    
    navigator.clipboard.writeText(absoluteUrl)
    toast.success("Link copiado para a área de transferência!")
  }

  return (
    <Button 
      variant="secondary" 
      className="flex-1 rounded-xl text-primary font-medium hover:bg-white/90"
      onClick={handleCopy}
    >
      Copiar link
    </Button>
  )
}
