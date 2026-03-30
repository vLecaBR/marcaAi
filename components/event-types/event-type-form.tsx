"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod" // <-- ADICIONADO AQUI
import { eventTypeSchema, type EventTypeInput } from "@/lib/validators/event-type"
import { upsertEventTypeAction } from "@/lib/actions/event-types"
import { cn } from "@/lib/utils"

const COLORS: { value: EventTypeInput["color"]; class: string }[] = [
  { value: "VIOLET",  class: "bg-violet-500" },
  { value: "ROSE",    class: "bg-rose-500" },
  { value: "EMERALD", class: "bg-emerald-500" },
  { value: "AMBER",   class: "bg-amber-500" },
  { value: "CYAN",    class: "bg-cyan-500" },
  { value: "TEAL",    class: "bg-teal-500" },
  { value: "ORANGE",  class: "bg-orange-500" },
  { value: "FUCHSIA", class: "bg-fuchsia-500" },
  { value: "SLATE",   class: "bg-slate-500" },
]

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]

const LOCATION_OPTIONS: { value: EventTypeInput["locationType"]; label: string }[] = [
  { value: "GOOGLE_MEET", label: "Google Meet" },
  { value: "ZOOM",        label: "Zoom" },
  { value: "TEAMS",       label: "Microsoft Teams" },
  { value: "PHONE",       label: "Telefone" },
  { value: "IN_PERSON",   label: "Presencial" },
  { value: "CUSTOM",      label: "Link personalizado" },
]

interface EventTypeFormProps {
  open: boolean
  onClose: () => void
  defaultValues?: Partial<EventTypeInput> & { id?: string }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export function EventTypeForm({ open, onClose, defaultValues }: EventTypeFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = !!defaultValues?.id

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof eventTypeSchema>, any, EventTypeInput>({ // <-- MAGIA ACONTECE AQUI
    resolver: zodResolver(eventTypeSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      duration: 30,
      color: "VIOLET",
      isActive: true,
      requiresConfirm: false,
      beforeEventBuffer: 0,
      afterEventBuffer: 0,
      bookingLimitDays: 60,
      locationType: "GOOGLE_MEET",
      locationValue: "",
      ...defaultValues,
    },
  })

  const titleValue = watch("title")
  const colorValue = watch("color")
  const locationTypeValue = watch("locationType")

  // Auto-gera slug a partir do título (apenas na criação)
  useEffect(() => {
    if (!isEditing) {
      setValue("slug", slugify(titleValue ?? ""), { shouldValidate: false })
    }
  }, [titleValue, isEditing, setValue])

  useEffect(() => {
    if (open) {
      reset({
        title: "",
        slug: "",
        description: "",
        duration: 30,
        color: "VIOLET",
        isActive: true,
        requiresConfirm: false,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        bookingLimitDays: 60,
        locationType: "GOOGLE_MEET",
        locationValue: "",
        ...defaultValues,
      })
      setServerError(null)
    }
  }, [open, defaultValues, reset])

  async function onSubmit(data: EventTypeInput) {
    setServerError(null)
    const payload = defaultValues?.id
      ? { ...data, id: defaultValues.id }
      : data

    const result = await upsertEventTypeAction(payload)

    if (result.success) {
      router.refresh()
      onClose()
    } else {
      setServerError(result.error)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {isEditing ? "Editar tipo de evento" : "Novo tipo de evento"}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-6 py-5">
          {serverError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              <p className="text-sm text-rose-400">{serverError}</p>
            </div>
          )}

          {/* Título */}
          <Field label="Título" error={errors.title?.message}>
            <input
              {...register("title")}
              placeholder="Ex: Reunião de 30 minutos"
              className={inputClass}
            />
          </Field>

          {/* Slug */}
          <Field label="Slug (URL)" error={errors.slug?.message}>
            <input
              {...register("slug")}
              placeholder="reuniao-30-min"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-600">
              Aparece na URL pública do agendamento
            </p>
          </Field>

          {/* Descrição */}
          <Field label="Descrição" error={errors.description?.message}>
            <textarea
              {...register("description")}
              placeholder="Descreva o propósito deste evento..."
              rows={2}
              className={cn(inputClass, "resize-none")}
            />
          </Field>

          {/* Duração */}
          <Field label="Duração" error={errors.duration?.message}>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setValue("duration", d)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                    watch("duration") === d
                      ? "border-violet-600 bg-violet-600/10 text-violet-400"
                      : "border-zinc-700 bg-transparent text-zinc-400 hover:border-zinc-600 hover:text-white"
                  )}
                >
                  {d} min
                </button>
              ))}
              <input
                {...register("duration", { valueAsNumber: true })}
                type="number"
                placeholder="outro"
                className={cn(inputClass, "w-20 py-1.5")}
              />
            </div>
          </Field>

          {/* Cor */}
          <Field label="Cor" error={errors.color?.message}>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setValue("color", c.value)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-all ring-offset-zinc-950",
                    c.class,
                    colorValue === c.value
                      ? "ring-2 ring-white ring-offset-2"
                      : "opacity-50 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </Field>

          {/* Localização */}
          <Field label="Localização" error={errors.locationType?.message}>
            <select
              {...register("locationType")}
              className={cn(inputClass, "appearance-none")}
            >
              {LOCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {(locationTypeValue === "CUSTOM" ||
            locationTypeValue === "IN_PERSON" ||
            locationTypeValue === "PHONE") && (
            <Field label="Detalhes da localização" error={errors.locationValue?.message}>
              <input
                {...register("locationValue")}
                placeholder={
                  locationTypeValue === "PHONE"
                    ? "+55 (11) 99999-9999"
                    : locationTypeValue === "IN_PERSON"
                    ? "Endereço completo"
                    : "https://..."
                }
                className={inputClass}
              />
            </Field>
          )}

          {/* Buffers */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buffer antes (min)" error={errors.beforeEventBuffer?.message}>
              <input
                {...register("beforeEventBuffer", { valueAsNumber: true })}
                type="number"
                min={0}
                max={60}
                className={inputClass}
              />
            </Field>
            <Field label="Buffer depois (min)" error={errors.afterEventBuffer?.message}>
              <input
                {...register("afterEventBuffer", { valueAsNumber: true })}
                type="number"
                min={0}
                max={60}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Limite de dias */}
          <Field label="Agendamentos até (dias)" error={errors.bookingLimitDays?.message}>
            <input
              {...register("bookingLimitDays", { valueAsNumber: true })}
              type="number"
              min={1}
              max={365}
              placeholder="60"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-600">
              Quantos dias à frente os convidados podem agendar
            </p>
          </Field>

            {/* Flags */}
          <div className="space-y-3 rounded-xl border border-zinc-800 p-4">
            <Toggle
              label="Requer confirmação manual"
              description="Você precisa aprovar cada agendamento antes de confirmar."
              checked={watch("requiresConfirm") ?? false} // <-- SÓ ADICIONAR O '?? false'
              onChange={(v) => setValue("requiresConfirm", v)}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white",
                "transition-all hover:bg-violet-500 active:scale-[0.99]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              {isSubmitting
                ? "Salvando..."
                : isEditing
                ? "Salvar alterações"
                : "Criar evento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center"
      >
        <div className={cn(
          "h-5 w-9 rounded-full border transition-all",
          checked ? "bg-violet-600 border-violet-600" : "bg-zinc-700 border-zinc-600"
        )} />
        <div className={cn(
          "absolute h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-4.5" : "left-0.5"
        )} />
      </button>
    </div>
  )
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all focus:border-violet-500 focus:ring-1 focus:ring-violet-500"