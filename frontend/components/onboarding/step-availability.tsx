"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { availabilitySchema, type AvailabilityInput } from "@/lib/validators/onboarding"
import { saveAvailabilityAction } from "@/lib/actions/availability"
import { cn } from "@/lib/utils"
import { Plus, Trash2 } from "lucide-react"

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const DEFAULT_DAYS: AvailabilityInput["availabilities"] = [
  { dayOfWeek: 0, enabled: false, intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 1, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 2, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 3, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 4, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 5, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 6, enabled: false, intervals: [{ startTime: "09:00", endTime: "18:00" }] },
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0")
  const m = i % 2 === 0 ? "00" : "30"
  return `${h}:${m}`
})

interface StepAvailabilityProps {
  schedule: {
    id: string
    timeZone: string
    availabilities: { dayOfWeek: number; startTime: string; endTime: string }[]
  } | null
  onSuccess: () => void
  isFinishing: boolean
}

export function StepAvailability({
  schedule,
  onSuccess,
  isFinishing,
}: StepAvailabilityProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const initialDays = DEFAULT_DAYS.map((def) => {
    const existing = schedule?.availabilities
      .filter((a) => a.dayOfWeek === def.dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    if (existing && existing.length > 0) {
      return {
        dayOfWeek: def.dayOfWeek,
        enabled: true,
        intervals: existing.map(e => ({ startTime: e.startTime, endTime: e.endTime }))
      }
    }
    return def
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AvailabilityInput>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      scheduleId: schedule?.id ?? "",
      timeZone: schedule?.timeZone ?? "America/Sao_Paulo",
      availabilities: initialDays,
    },
  })

  const watchedDays = watch("availabilities")

  async function onSubmit(data: AvailabilityInput) {
    setServerError(null)
    const result = await saveAvailabilityAction(data)
    if (result.success) {
      onSuccess()
    } else {
      setServerError(result.error)
    }
  }

  function addInterval(dayIndex: number) {
    const currentIntervals = watchedDays[dayIndex].intervals
    const newStart = "13:00"
    const newEnd = "18:00"
    setValue(`availabilities.${dayIndex}.intervals`, [
      ...currentIntervals,
      { startTime: newStart, endTime: newEnd }
    ])
  }

  function removeInterval(dayIndex: number, intervalIndex: number) {
    const currentIntervals = watchedDays[dayIndex].intervals
    if (currentIntervals.length <= 1) {
      setValue(`availabilities.${dayIndex}.enabled`, false)
      return
    }
    setValue(
      `availabilities.${dayIndex}.intervals`,
      currentIntervals.filter((_, i) => i !== intervalIndex)
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Sua disponibilidade</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina os dias e horários em que você aceita agendamentos.
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      {/* Lista de dias */}
      <div className="space-y-3">
        {DEFAULT_DAYS.map((_, index) => {
          const isEnabled = watchedDays[index]?.enabled
          const intervals = watchedDays[index]?.intervals || []
          const hasError = errors.availabilities?.[index]?.intervals

          return (
            <div
              key={index}
              className={cn(
                "flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl border px-4 py-3 transition-all",
                isEnabled
                  ? "border-border bg-muted"
                  : "border-border/60 bg-card"
              )}
            >
              {/* Header do Dia (Toggle + Nome) */}
              <div className="flex w-full sm:w-28 items-center gap-3 shrink-0 sm:pt-1.5">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    {...register(`availabilities.${index}.enabled`)}
                  />
                  <div className={cn(
                    "h-5 w-9 rounded-full border transition-all",
                    "peer-checked:bg-brand-primary peer-checked:border-brand-primary",
                    "bg-switch-background border-border",
                    "after:absolute after:top-[2px] after:left-[2px]",
                    "after:h-4 after:w-4 after:rounded-full after:bg-white",
                    "after:transition-all peer-checked:after:translate-x-full"
                  )} />
                </label>
                <span className={cn(
                  "text-sm font-medium",
                  isEnabled ? "text-foreground" : "text-muted-foreground"
                )}>
                  {DAY_LABELS[index]}
                </span>
              </div>

              {/* Intervalos */}
              <div className="flex-1 space-y-3">
                {isEnabled ? (
                  <>
                    {intervals.map((interval, iIndex) => (
                      <div key={iIndex} className="flex flex-wrap items-center gap-2">
                        <select
                          {...register(`availabilities.${index}.intervals.${iIndex}.startTime`)}
                          className="w-20 sm:w-24 rounded-lg border border-border bg-input-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand-primary transition-colors"
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <span className="text-muted-foreground text-xs">até</span>
                        <select
                          {...register(`availabilities.${index}.intervals.${iIndex}.endTime`)}
                          className="w-20 sm:w-24 rounded-lg border border-border bg-input-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand-primary transition-colors"
                        >
                          {TIME_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        
                        <button
                          type="button"
                          onClick={() => removeInterval(index, iIndex)}
                          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-input-background hover:text-foreground transition-colors"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      type="button"
                      onClick={() => addInterval(index)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:text-brand-primary/80 transition-colors mt-2"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar intervalo
                    </button>

                    {hasError && (
                      <p className="text-xs text-destructive mt-2">
                        {hasError.message || "Intervalo inválido."}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground sm:pt-1 block">Indisponível</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {errors.availabilities && !Array.isArray(errors.availabilities) && (
        <p className="text-xs text-destructive">
          {typeof errors.availabilities.message === "string"
            ? errors.availabilities.message
            : "Verifique os horários configurados."}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isFinishing}
        className={cn(
          "w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-medium text-white",
          "transition-all hover:bg-brand-primary/90 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        {isSubmitting || isFinishing ? "Finalizando..." : "Concluir configuração →"}
      </button>
    </form>
  )
}
