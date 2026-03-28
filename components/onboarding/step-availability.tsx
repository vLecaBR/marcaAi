"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState, useEffect } from "react"
import { availabilitySchema, type AvailabilityInput } from "@/lib/validators/onboarding"
import { saveAvailabilityAction } from "@/lib/actions/availability"
import { cn } from "@/lib/utils"
import { prisma } from "@/lib/prisma"

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const DEFAULT_DAYS: AvailabilityInput["availabilities"] = [
  { dayOfWeek: 0, enabled: false, startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 1, enabled: true,  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 2, enabled: true,  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 3, enabled: true,  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 4, enabled: true,  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 5, enabled: true,  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 6, enabled: false, startTime: "09:00", endTime: "18:00" },
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

  // Monta os dias a partir do schedule existente
  const initialDays = DEFAULT_DAYS.map((def) => {
    const existing = schedule?.availabilities.find(
      (a) => a.dayOfWeek === def.dayOfWeek
    )
    if (existing) {
      return {
        ...def,
        enabled: true,
        startTime: existing.startTime,
        endTime: existing.endTime,
      }
    }
    return def
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AvailabilityInput>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      scheduleId: schedule?.id ?? "",
      timeZone: schedule?.timeZone ?? "America/Sao_Paulo",
      availabilities: initialDays,
    },
  })

  const { fields } = useFieldArray({ control, name: "availabilities" })
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Sua disponibilidade</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Defina os dias e horários em que você aceita agendamentos.
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm text-rose-400">{serverError}</p>
        </div>
      )}

      {/* Lista de dias */}
      <div className="space-y-2">
        {fields.map((field, index) => {
          const isEnabled = watchedDays[index]?.enabled

          return (
            <div
              key={field.id}
              className={cn(
                "flex items-center gap-4 rounded-xl border px-4 py-3 transition-all",
                isEnabled
                  ? "border-zinc-700 bg-zinc-800/60"
                  : "border-zinc-800 bg-zinc-900/40"
              )}
            >
              {/* Toggle */}
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  {...register(`availabilities.${index}.enabled`)}
                />
                <div className={cn(
                  "h-5 w-9 rounded-full border transition-all",
                  "peer-checked:bg-violet-600 peer-checked:border-violet-600",
                  "bg-zinc-700 border-zinc-600",
                  "after:absolute after:top-0.5 after:left-0.5",
                  "after:h-4 after:w-4 after:rounded-full after:bg-white",
                  "after:transition-all peer-checked:after:translate-x-4"
                )} />
              </label>

              {/* Dia */}
              <span
                className={cn(
                  "w-8 text-sm font-medium",
                  isEnabled ? "text-white" : "text-zinc-600"
                )}
              >
                {DAY_LABELS[field.dayOfWeek]}
              </span>

              {/* Horários */}
              {isEnabled ? (
                <div className="flex flex-1 items-center gap-2">
                  <select
                    {...register(`availabilities.${index}.startTime`)}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500 transition-colors"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-zinc-500 text-xs">até</span>
                  <select
                    {...register(`availabilities.${index}.endTime`)}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500 transition-colors"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="flex-1 text-sm text-zinc-600">Indisponível</span>
              )}
            </div>
          )
        })}
      </div>

      {errors.availabilities && (
        <p className="text-xs text-rose-400">
          {typeof errors.availabilities.message === "string"
            ? errors.availabilities.message
            : "Verifique os horários configurados."}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isFinishing}
        className={cn(
          "w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white",
          "transition-all hover:bg-violet-500 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
          "disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        {isSubmitting || isFinishing ? "Finalizando..." : "Concluir configuração →"}
      </button>
    </form>
  )
}