/**
 * TrialBanner — strip persistente do Free Trial de 30 dias (Fase 8 · §8.2).
 *
 * Server-safe (sem `"use client"`): recebe o `TeamBillingDto` resolvido no servidor. Só aparece
 * durante o trial (`billing.trial.isTrialing`). Comunica os dias restantes e oferece o CTA
 * "Escolher plano". Ao se aproximar do fim (≤ `WARN_THRESHOLD_DAYS`), muda para o tom âmbar de
 * aviso. A expiração real (downgrade + gating) é enforçada pelo backend — o front só reflete.
 */

import Link from "next/link"
import { Sparkles, Clock } from "lucide-react"
import { PLANS_ROUTE } from "@/components/billing/premium-gate"
import type { TeamBillingDto } from "@/lib/api/billing-types"

/** A partir de quantos dias restantes o banner vira "aviso" (§8.2). */
const WARN_THRESHOLD_DAYS = 7

interface TrialBannerProps {
  billing: TeamBillingDto
  upgradeHref?: string
}

export function TrialBanner({ billing, upgradeHref = PLANS_ROUTE }: TrialBannerProps) {
  const { isTrialing, daysRemaining } = billing.trial
  if (!isTrialing) return null

  const days = daysRemaining ?? 0
  const isWarning = days <= WARN_THRESHOLD_DAYS
  const Icon = isWarning ? Clock : Sparkles

  // Copy acolhedora, sem jargão (§7.5), com plural correto.
  const daysLabel =
    days <= 0 ? "termina hoje" : `${days} ${days === 1 ? "dia restante" : "dias restantes"}`

  return (
    <div
      role="status"
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        isWarning
          ? "border-warning/30 bg-warning/10 text-warning-foreground"
          : "border-brand-primary/20 bg-brand-primary/10 text-foreground"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">
          Você está no período de testes — <span className="font-semibold">{daysLabel}</span>.
          {isWarning && " Escolha um plano para não perder o acesso premium."}
        </p>
      </div>

      <Link
        href={upgradeHref}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          isWarning ? "bg-warning text-warning-foreground hover:bg-warning/90" : "bg-brand-primary text-white hover:bg-brand-primary/90"
        }`}
      >
        Escolher plano
      </Link>
    </div>
  )
}
