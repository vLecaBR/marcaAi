"use client"

import { useState, useEffect } from "react"
import { submitOnboarding } from "./actions"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Logo } from "@/components/ui/logo"
import { ArrowRight, ArrowLeft, Check, Link2, Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const steps = [
  { id: 1, title: "Seu link", icon: Link2 },
  { id: 2, title: "Preferências", icon: Settings },
]

export default function OnboardingPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [timeZone, setTimeZone] = useState("America/Sao_Paulo")

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  const next = () => (step < 2 ? setStep(step + 1) : null)
  const back = () => (step > 1 ? setStep(step - 1) : null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("timeZone", timeZone)
    
    try {
      const result = await submitOnboarding(formData)
      
      if (result.error) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      if (result.success) {
        await update({ onboarded: true })
        router.push("/dashboard")
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col">
      <header className="p-6 flex items-center justify-center">
        <Logo />
      </header>

      <div className="flex-1 flex items-start justify-center px-6 pb-16 pt-8">
        <Card className="w-full max-w-2xl p-10 rounded-2xl shadow-sm border-border/60">
          <div className="flex items-center justify-between mb-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex-1 flex items-center">
                <div className={`flex items-center gap-2.5 ${i === 0 ? "" : "ml-2"}`}>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                      step > s.id
                        ? "bg-primary text-primary-foreground"
                        : step === s.id
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.id ? <Check size={16} /> : <s.icon size={16} />}
                  </div>
                  <span className={`text-sm hidden sm:inline ${step >= s.id ? "" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-3 ${step > s.id ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
          <Progress value={(step / 2) * 100} className="mt-6 h-1" />

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive border border-destructive/20">
                {error}
              </div>
            )}

            <div className="mt-9 min-h-[220px]">
              {step === 1 && (
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 600 }}>Escolha seu link</h2>
                  <p className="text-sm text-muted-foreground mt-1.5">É aqui que as pessoas vão marcar um horário com você.</p>
                  <div className="mt-7">
                    <label className="text-sm font-medium">URL da sua agenda</label>
                    <div className="mt-1.5 flex items-center rounded-xl border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring/30 bg-background">
                      <span className="px-3 py-2.5 bg-muted text-sm text-muted-foreground border-r border-input">marca-ai-app.vercel.app/</span>
                      <input 
                        name="username" 
                        required 
                        className="flex-1 px-3 py-2.5 bg-transparent outline-none text-sm" 
                        placeholder="seunome" 
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 600 }}>Preferências</h2>
                  <p className="text-sm text-muted-foreground mt-1.5">Ajuste os detalhes finais da sua conta.</p>
                  <div className="mt-7 space-y-5">
                    <div>
                      <label className="text-sm font-medium">Tema de Preferência</label>
                      <div className="mt-1.5">
                        <Select name="theme" defaultValue="DARK">
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue placeholder="Selecione um tema" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DARK">Escuro</SelectItem>
                            <SelectItem value="LIGHT">Claro</SelectItem>
                            <SelectItem value="SYSTEM">Sistema</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Fuso Horário</label>
                      <Input className="mt-1.5 h-11 rounded-xl bg-muted/50 cursor-not-allowed" readOnly value={timeZone} />
                      <p className="text-xs text-muted-foreground mt-2">Detectado automaticamente pelo seu navegador.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between">
              {step > 1 ? (
                <Button type="button" variant="ghost" onClick={back} className="rounded-xl">
                  <ArrowLeft size={16} className="mr-1" /> Voltar
                </Button>
              ) : (
                <div />
              )}
              {step < 2 ? (
                <Button type="button" onClick={next} className="rounded-xl h-11 px-6">
                  Continuar <ArrowRight size={16} className="ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={isLoading} className="rounded-xl h-11 px-6">
                  {isLoading ? "Salvando..." : "Concluir"} <Check size={16} className="ml-1" />
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}