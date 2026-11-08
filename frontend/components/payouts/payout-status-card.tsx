"use client"

/**
 * Card de status da conta de recebimento (Fase 4 · spec §5).
 *
 * Estados (spec §5.3 · paleta Healthtech):
 *  - ACTIVE     → `care` (verde) "Recebimentos ativos"
 *  - PENDING    → `warning` "Falta pouco: conclua seu cadastro no provedor"
 *  - RESTRICTED → `destructive` "Cadastro com pendências"
 *  - sem conta  → estado vazio acolhedor + CTA "Ativar recebimentos"
 *
 * O CTA chama a Server Action-proxy `startPayoutOnboardingAction` (a API devolve a `onboardingUrl`
 * do Stripe Connect Express) e redireciona o profissional ao provedor. Sem SDK do Stripe aqui.
 */

import { useState } from "react"
import { CheckCircle2, AlertTriangle, ShieldAlert, ArrowUpRight, Wallet, Loader2 } from "lucide-react"
import { m } from "motion/react"
import { startPayoutOnboardingAction } from "@/lib/actions/payouts"
import { cn } from "@/lib/utils"
import type { PayoutAccountDto, PayoutAccountStatus } from "@/lib/api/payout-types"

type StatusStyle = {
  label: string
  helper: string
  badgeClass: string
  icon: typeof CheckCircle2
  iconClass: string
}

const STATUS_STYLES: Record<PayoutAccountStatus, StatusStyle> = {
  ACTIVE: {
    label: "Recebimentos ativos",
    helper: "Tudo certo! Os valores das consultas caem direto na sua conta.",
    badgeClass: "bg-care/10 text-care",
    icon: CheckCircle2,
    iconClass: "text-care",
  },
  PENDING: {
    label: "Cadastro em andamento",
    helper: "Falta pouco: conclua seu cadastro no provedor para começar a receber.",
    badgeClass: "bg-warning/10 text-warning-foreground",
    icon: AlertTriangle,
    iconClass: "text-warning",
  },
  RESTRICTED: {
    label: "Cadastro com pendências",
    helper: "O provedor sinalizou pendências na sua conta. Reveja seus dados para reativar.",
    badgeClass: "bg-destructive/10 text-destructive",
    icon: ShieldAlert,
    iconClass: "text-destructive",
  },
}

export function PayoutStatusCard({ account }: { account: PayoutAccountDto | null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = account?.status ?? null
  const isActive = status === "ACTIVE"
  const style = status ? STATUS_STYLES[status] : null

  async function handleActivate() {
    setLoading(true)
    setError(null)
    const result = await startPayoutOnboardingAction("STRIPE")
    if ("onboardingUrl" in result) {
      // Prefere o link já entregue pelo backend; senão, o do onboarding recém-iniciado.
      window.location.href = account?.onboardingUrl || result.onboardingUrl
      return
    }
    setError(result.error)
    setLoading(false)
  }

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-8"
      aria-labelledby="payout-status-heading"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 id="payout-status-heading" className="text-lg font-semibold">
              Conta de recebimento
            </h2>

            {style ? (
              <>
                <div
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                    style.badgeClass,
                  )}
                >
                  <style.icon className={cn("h-3.5 w-3.5", style.iconClass)} />
                  {style.label}
                </div>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">{style.helper}</p>
                {isActive && account?.bankLabel && (
                  <p className="mt-2 text-sm text-foreground/70">
                    Repasses para <span className="font-medium">{account.bankLabel}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Ative sua conta de recebimento para receber o valor das consultas automaticamente,
                com repasse direto para o seu banco.
              </p>
            )}
          </div>
        </div>

        {!isActive && (
          <div className="shrink-0">
            <button
              onClick={handleActivate}
              disabled={loading}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-medium text-white",
                "min-h-11 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-70",
                "focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:outline-none md:w-auto",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Abrindo o provedor…
                </>
              ) : (
                <>
                  {status === "PENDING" ? "Concluir cadastro" : "Ativar recebimentos"}
                  <ArrowUpRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </m.section>
  )
}
