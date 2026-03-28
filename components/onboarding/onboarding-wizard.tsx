"use client"

import { useState } from "react"
import { StepProfile } from "./step-profile"
import { StepAvailability } from "./step-availability"
import { completeOnboardingAction } from "@/lib/actions/onboarding"
import { cn } from "@/lib/utils"

interface WizardProps {
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
    username: string | null
    timeZone: string
    bio: string | null
  }
  schedule: {
    id: string
    timeZone: string
    availabilities: {
      dayOfWeek: number
      startTime: string
      endTime: string
    }[]
  } | null
}

const STEPS = [
  { id: 1, label: "Perfil" },
  { id: 2, label: "Disponibilidade" },
]

export function OnboardingWizard({ user, schedule }: WizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isFinishing, setIsFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  async function handleFinish() {
    if (isFinishing) return // evita double click bug

    setIsFinishing(true)
    setFinishError(null)

    try {
      const result = await completeOnboardingAction()

      if (!result.success) {
        setFinishError(result.error)
        setIsFinishing(false)
        return
      }

      // 🔥 força atualização do JWT/session no NextAuth
      await fetch("/api/auth/session", { method: "POST" })

      // 🔥 força reload completo (middleware vai ler atualizado)
      window.location.href = "/dashboard"
    } catch (err) {
      console.error(err)
      setFinishError("Erro inesperado ao finalizar onboarding.")
      setIsFinishing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
            <svg
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
              />
            </svg>
          </span>
          <span className="text-xl font-semibold tracking-tight text-white">
            People <span className="text-violet-400">OS</span>
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Vamos configurar sua conta
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          Leva menos de 2 minutos.
        </p>
      </div>

      {/* Steps */}
      <div className="mb-8 flex items-center justify-center gap-3">
        {STEPS.map((step, idx) => (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all",
                  currentStep === step.id
                    ? "bg-violet-600 text-white"
                    : currentStep > step.id
                    ? "bg-violet-600/20 text-violet-400"
                    : "bg-zinc-800 text-zinc-500"
                )}
              >
                {currentStep > step.id ? (
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                ) : (
                  step.id
                )}
              </div>

              <span
                className={cn(
                  "text-sm",
                  currentStep === step.id ? "text-white" : "text-zinc-500"
                )}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-12 transition-all",
                  currentStep > step.id ? "bg-violet-600/50" : "bg-zinc-800"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-sm">
        {finishError && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <p className="text-sm text-rose-400">{finishError}</p>
          </div>
        )}

        {currentStep === 1 && (
          <StepProfile
            user={user}
            onSuccess={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <StepAvailability
            schedule={schedule}
            onSuccess={handleFinish}
            isFinishing={isFinishing}
          />
        )}
      </div>
    </div>
  )
}