"use client"

/**
 * Saldo e saques (Fase 4 · spec §5).
 *
 * Estrutura/assinatura definitivas (`lib/api/payout-types.ts`). Sem movimentação (lista vazia) →
 * empty state neutro. A agregação é sempre do servidor (spec §6.3): aqui só formatamos centavos.
 */

import { Stagger, StaggerItem } from "@/components/motion/primitives"
import { EmptyState } from "@/components/ui/empty-state"
import { ArrowDownLeft, ArrowUpRight, Clock, Banknote, RotateCcw, Receipt } from "lucide-react"
import { cn, formatBRLCents } from "@/lib/utils"
import type {
  PayoutBalanceDto,
  PayoutTransactionDto,
  PayoutTransactionKind,
  PayoutTransactionStatus,
} from "@/lib/api/payout-types"

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
})

const KIND_META: Record<PayoutTransactionKind, { icon: typeof Banknote; label: string }> = {
  PAYMENT: { icon: ArrowDownLeft, label: "Consulta paga" },
  PAYOUT: { icon: Banknote, label: "Saque" },
  REFUND: { icon: RotateCcw, label: "Estorno" },
  FEE: { icon: ArrowUpRight, label: "Taxa" },
}

const TX_STATUS_LABEL: Record<PayoutTransactionStatus, { text: string; className: string }> = {
  PAID: { text: "Concluído", className: "bg-care/10 text-care" },
  PENDING: { text: "Pendente", className: "bg-warning/10 text-warning-foreground" },
  IN_TRANSIT: { text: "A caminho do banco", className: "bg-brand-primary/10 text-brand-primary" },
  FAILED: { text: "Falhou", className: "bg-destructive/10 text-destructive" },
}

function BalanceStat({
  label,
  cents,
  icon: Icon,
  accent,
}: {
  label: string
  cents: number
  icon: typeof Banknote
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn("h-4 w-4", accent)} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{formatBRLCents(cents)}</p>
    </div>
  )
}

export function PayoutBalanceCard({
  balance,
  transactions,
}: {
  balance: PayoutBalanceDto
  transactions: PayoutTransactionDto[]
}) {
  return (
    <section className="space-y-4" aria-labelledby="payout-balance-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payout-balance-heading" className="text-lg font-semibold">
          Seu saldo
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BalanceStat
          label="Disponível para saque"
          cents={balance.availableCents}
          icon={Banknote}
          accent="text-care"
        />
        <BalanceStat
          label="A liberar"
          cents={balance.pendingCents}
          icon={Clock}
          accent="text-warning"
        />
        <BalanceStat
          label="Já sacado"
          cents={balance.paidOutCents}
          icon={ArrowUpRight}
          accent="text-brand-primary"
        />
      </div>

      {balance.nextPayoutDate && (
        <p className="text-sm text-muted-foreground">
          Próximo repasse automático em{" "}
          <span className="font-medium text-foreground/80">
            {DATE_FMT.format(new Date(balance.nextPayoutDate))}
          </span>
          .
        </p>
      )}

      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 px-5 py-4">
          <h3 className="text-sm font-semibold">Últimas movimentações</h3>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma movimentação ainda"
            description="Assim que você receber sua primeira consulta, os pagamentos e saques aparecem aqui."
          />
        ) : (
          <Stagger className="divide-y divide-border/60">
            {transactions.map((tx) => {
              const meta = KIND_META[tx.kind]
              const status = TX_STATUS_LABEL[tx.status]
              const isPositive = tx.amountCents >= 0
              return (
                <StaggerItem key={tx.id}>
                  <div className="flex items-center gap-4 px-5 py-3.5">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        isPositive ? "bg-care/10 text-care" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <meta.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {DATE_FMT.format(new Date(tx.date))}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          isPositive ? "text-care" : "text-foreground",
                        )}
                      >
                        {isPositive ? "+" : "−"}
                        {formatBRLCents(Math.abs(tx.amountCents))}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          status.className,
                        )}
                      >
                        {status.text}
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
      </div>
    </section>
  )
}
