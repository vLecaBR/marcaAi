"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { availabilitySchema, type AvailabilityInput } from "@/lib/validators/onboarding"
import { saveAvailabilityAction } from "@/lib/actions/availability"
import { cn } from "@/lib/utils"
import { Plus, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const DAY_LABELS = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"
]

const DEFAULT_DAYS = [
  { dayOfWeek: 0, enabled: false, intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 1, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 2, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 3, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 4, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 5, enabled: true,  intervals: [{ startTime: "09:00", endTime: "18:00" }] },
  { dayOfWeek: 6, enabled: false, intervals: [{ startTime: "09:00", endTime: "18:00" }] },
]

interface AvailabilityFormProps {
  schedule: {
    id: string
    timeZone: string
    availabilities: { dayOfWeek: number; startTime: string; endTime: string }[]
  }
}

export function AvailabilityForm({ schedule }: AvailabilityFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Monta os dias agrupando intervalos
  const initialDays = DEFAULT_DAYS.map((def) => {
    const existing = schedule.availabilities
      .filter((a) => a.dayOfWeek === def.dayOfWeek)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    if (existing.length > 0) {
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
      scheduleId: schedule.id,
      timeZone: schedule.timeZone || "America/Sao_Paulo",
      availabilities: initialDays,
    },
  })

  const watchedDays = watch("availabilities")

  async function onSubmit(data: AvailabilityInput) {
    setServerError(null)
    setSuccessMsg(null)
    const result = await saveAvailabilityAction(data)
    if (result.success) {
      setSuccessMsg("Disponibilidade salva com sucesso!")
      setTimeout(() => setSuccessMsg(null), 3000)
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

  function handleToggleDay(dayIndex: number, checked: boolean) {
    setValue(`availabilities.${dayIndex}.enabled`, checked)
    if (checked && watchedDays[dayIndex].intervals.length === 0) {
      setValue(`availabilities.${dayIndex}.intervals`, [{ startTime: "09:00", endTime: "17:00" }])
    }
  }

  return (
    <Card className="p-6 rounded-2xl border-border/60 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold">Horários da semana</h2>
      <p className="text-sm text-muted-foreground mb-5">Horários padrão de trabalho no seu fuso horário.</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        {serverError && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}
        
        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMsg}</p>
          </div>
        )}

        <div className="divide-y divide-border/60">
          {DEFAULT_DAYS.map((_, index) => {
            const isEnabled = watchedDays[index]?.enabled
            const intervals = watchedDays[index]?.intervals || []
            const hasError = errors.availabilities?.[index]?.intervals

            return (
              <div key={index} className="py-4 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
                <div className="w-40 sm:pt-2 flex items-center gap-3">
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggleDay(index, checked)}
                  />
                  <span className={cn(
                    "text-sm font-medium",
                    !isEnabled && "text-muted-foreground"
                  )}>
                    {DAY_LABELS[index]}
                  </span>
                </div>

                <div className="flex-1">
                  {isEnabled ? (
                    <div className="space-y-2">
                      {intervals.map((interval, iIndex) => (
                        <div key={iIndex} className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="time"
                            {...register(`availabilities.${index}.intervals.${iIndex}.startTime`)}
                            className="w-24 h-9 rounded-lg"
                          />
                          <span className="text-muted-foreground text-sm">–</span>
                          <Input
                            type="time"
                            {...register(`availabilities.${index}.intervals.${iIndex}.endTime`)}
                            className="w-24 h-9 rounded-lg"
                          />
                          <Button 
                            type="button"
                            size="icon" 
                            variant="ghost" 
                            className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive" 
                            onClick={() => removeInterval(index, iIndex)}
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      ))}
                      {hasError && (
                        <p className="text-xs text-destructive mt-1">
                          {hasError.message || "Intervalo inválido."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="sm:pt-2 text-sm text-muted-foreground">Indisponível</div>
                  )}
                </div>

                <div className="hidden sm:block">
                  <Button 
                    type="button"
                    size="icon" 
                    variant="ghost" 
                    className="h-9 w-9 rounded-lg shrink-0" 
                    onClick={() => addInterval(index)} 
                    disabled={!isEnabled}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
                
                {/* Mobile add button */}
                {isEnabled && (
                  <div className="sm:hidden mt-1">
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="sm"
                      className="h-8 rounded-lg gap-1.5 px-2" 
                      onClick={() => addInterval(index)}
                    >
                      <Plus size={14} /> Adicionar intervalo
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 pt-5 border-t border-border/60 flex justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-xl">Restaurar</Button>
          <Button type="submit" disabled={isSubmitting} className="rounded-xl">
            {isSubmitting ? "Salvando..." : "Salvar horários"}
          </Button>
        </div>
      </form>
    </Card>
  )
}