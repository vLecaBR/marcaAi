"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CopyLinkButton({ link }: { link: string }) {
  function handleCopy() {
    if (!link) {
      toast.error("Configure seu perfil primeiro para ter um link.")
      return
    }
    
    // Create absolute URL if it's just 'marcaai.com/...'
    // Since we're in the browser, we can use window.location.origin, 
    // but the link already has 'marcaai.com/username', so we just prepend 'https://'
    const fullLink = link.startsWith('http') ? link : `https://${link}`
    
    navigator.clipboard.writeText(fullLink)
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
