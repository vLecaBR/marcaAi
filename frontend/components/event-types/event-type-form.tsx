"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { Plus, Trash2 } from "lucide-react"
import { eventTypeSchema, type EventTypeInput } from "@/lib/validators/event-type"
import { upsertEventTypeAction } from "@/lib/actions/event-types"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const COLORS: { value: EventTypeInput["color"]; class: string }[] = [
  { value: "TEAL",    class: "bg-teal-500" },
  { value: "EMERALD", class: "bg-emerald-500" },
  { value: "CYAN",    class: "bg-cyan-500" },
  { value: "AMBER",   class: "bg-amber-500" },
  { value: "ORANGE",  class: "bg-orange-500" },
  { value: "ROSE",    class: "bg-rose-500" },
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
  userTeams?: { id: string, name: string }[]
}

/** Estilo compartilhado para controles nativos (select/textarea) alinhado ao primitivo Input. */
const controlClass =
  "w-full rounded-xl border border-input bg-input-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

export function EventTypeForm({ open, onClose, defaultValues, userTeams = [] }: EventTypeFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = !!defaultValues?.id

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof eventTypeSchema>, any, EventTypeInput>({
    resolver: zodResolver(eventTypeSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      duration: 30,
      color: "TEAL",
      isActive: true,
      requiresConfirm: false,
      beforeEventBuffer: 0,
      afterEventBuffer: 0,
      bookingLimitDays: 60,
      locationType: "IN_PERSON",
      locationValue: "",
      price: null,
      payOnSite: false,
      questions: [],
      ...defaultValues,
    },
  })

  const titleValue = watch("title")
  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control,
    name: "questions"
  })
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
        color: "TEAL",
        isActive: true,
        requiresConfirm: false,
        beforeEventBuffer: 0,
        afterEventBuffer: 0,
        bookingLimitDays: 60,
        locationType: "IN_PERSON",
        locationValue: "",
        price: null,
        payOnSite: false,
        questions: [],
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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar tipo de consulta" : "Novo tipo de consulta"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {serverError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          {/* Título */}
          <Field label="Título" htmlFor="et-title" error={errors.title?.message}>
            <Input id="et-title" {...register("title")} placeholder="Ex: Consulta de retorno" aria-invalid={!!errors.title} className="rounded-xl h-10" />
          </Field>

          {/* Slug */}
          <Field label="Slug (URL)" htmlFor="et-slug" error={errors.slug?.message}>
            <Input id="et-slug" {...register("slug")} placeholder="consulta-retorno" aria-invalid={!!errors.slug} className="rounded-xl h-10" />
            <p className="mt-1 text-xs text-muted-foreground">
              Aparece na URL pública do agendamento
            </p>
          </Field>

          {/* Descrição */}
          <Field label="Descrição" htmlFor="et-description" error={errors.description?.message}>
            <textarea
              id="et-description"
              {...register("description")}
              placeholder="Descreva o propósito desta consulta..."
              rows={2}
              className={cn(controlClass, "resize-none")}
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
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-brand-primary/40 hover:text-foreground"
                  )}
                >
                  {d} min
                </button>
              ))}
              <Input
                {...register("duration", { valueAsNumber: true })}
                type="number"
                placeholder="outro"
                className="w-20 rounded-xl h-9"
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
                  aria-label={`Cor ${c.value}`}
                  onClick={() => setValue("color", c.value)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-all ring-offset-card",
                    c.class,
                    colorValue === c.value
                      ? "ring-2 ring-brand-primary ring-offset-2"
                      : "opacity-50 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          </Field>

          {/* Localização */}
          <Field label="Localização" htmlFor="et-location" error={errors.locationType?.message}>
            <select id="et-location" {...register("locationType")} className={cn(controlClass, "appearance-none h-10")}>
              {LOCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field
            label={
              locationTypeValue === "IN_PERSON" ? "Endereço do atendimento"
              : locationTypeValue === "PHONE" ? "Telefone de contato"
              : locationTypeValue === "GOOGLE_MEET" ? "Link da videochamada (opcional)"
              : "Link da videochamada"
            }
            htmlFor="et-location-value"
            error={errors.locationValue?.message}
          >
            <Input
              id="et-location-value"
              {...register("locationValue")}
              placeholder={
                locationTypeValue === "PHONE"
                  ? "+55 (11) 99999-9999"
                  : locationTypeValue === "IN_PERSON"
                  ? "Rua, número, bairro, cidade"
                  : "https://..."
              }
              className="rounded-xl h-10"
            />
            {locationTypeValue === "GOOGLE_MEET" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Com o Google Agenda conectado (Integrações), o link do Meet é gerado sozinho a cada consulta.
                Sem ele, informe o link da sua sala.
              </p>
            )}
            {locationTypeValue !== "GOOGLE_MEET" && locationTypeValue !== "IN_PERSON" && locationTypeValue !== "PHONE" && (
              <p className="mt-1 text-xs text-muted-foreground">O paciente recebe este link na confirmação e no lembrete.</p>
            )}
          </Field>

          {/* Buffers */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buffer antes (min)" htmlFor="et-buffer-before" error={errors.beforeEventBuffer?.message}>
              <Input
                id="et-buffer-before"
                {...register("beforeEventBuffer", { valueAsNumber: true })}
                type="number"
                min={0}
                max={60}
                className="rounded-xl h-10"
              />
            </Field>
            <Field label="Buffer depois (min)" htmlFor="et-buffer-after" error={errors.afterEventBuffer?.message}>
              <Input
                id="et-buffer-after"
                {...register("afterEventBuffer", { valueAsNumber: true })}
                type="number"
                min={0}
                max={60}
                className="rounded-xl h-10"
              />
            </Field>
          </div>

          {/* Preço */}
          <Field label="Preço (Opcional)" htmlFor="et-price" error={errors.price?.message}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                id="et-price"
                {...register("price", {
                  setValueAs: (v) => {
                    if (v === "" || v === null || isNaN(v)) return null;
                    return Math.round(parseFloat(v) * 100); // Salva em centavos (inteiro)
                  }
                })}
                defaultValue={defaultValues?.price ? (defaultValues.price / 100).toFixed(2) : ""}
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                className="rounded-xl h-10 pl-9"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Deixe em branco para consultas gratuitas.
            </p>
          </Field>

          {(watch("price") ?? 0) > 0 && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-surface p-4">
              <Toggle
                label="Cobrar no atendimento"
                description="O valor aparece para o paciente, mas você recebe no consultório. A consulta é confirmada na hora."
                checked={watch("payOnSite") ?? false}
                onChange={(v) => setValue("payOnSite", v)}
              />
              {!(watch("payOnSite") ?? false) && (
                <p className="text-xs text-muted-foreground">
                  Pagamento online: o paciente paga para confirmar e o horário fica reservado por 15 minutos. É preciso ter os{" "}
                  <a href="/dashboard/recebimentos" className="underline">recebimentos</a> ativos.
                </p>
              )}
            </div>
          )}

          {/* Limite de dias */}
          <Field label="Agendamentos até (dias)" htmlFor="et-limit" error={errors.bookingLimitDays?.message}>
            <Input
              id="et-limit"
              {...register("bookingLimitDays", { valueAsNumber: true })}
              type="number"
              min={1}
              max={365}
              placeholder="60"
              className="rounded-xl h-10"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Quantos dias à frente os pacientes podem agendar
            </p>
          </Field>

            {/* Flags */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-surface p-4">
            <Toggle
              label="Requer confirmação manual"
              description="Você precisa aprovar cada agendamento antes de confirmar."
              checked={watch("requiresConfirm") ?? false}
              onChange={(v) => setValue("requiresConfirm", v)}
            />
          </div>

          {userTeams && userTeams.length > 0 && (
            <Field label="Equipe" htmlFor="et-team" error={errors.teamId?.message}>
              <select id="et-team" {...register("teamId")} className={cn(controlClass, "appearance-none h-10")}>
                <option value="">Pessoal (Apenas minha agenda)</option>
                {userTeams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Se selecionado, esta consulta será exibida na página da clínica.
              </p>
            </Field>
          )}

          {/* Perguntas Customizadas */}
          <div className="space-y-4 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Perguntas adicionais</h3>
                <p className="text-xs text-muted-foreground">Faça perguntas aos pacientes antes de agendar.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg"
                onClick={() => appendQuestion({ label: "", type: "TEXT", required: false, order: questionFields.length })}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>

            {questionFields.length > 0 && (
              <div className="space-y-3">
                {questionFields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-border/60 bg-surface p-4 relative group">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover pergunta"
                      onClick={() => removeQuestion(index)}
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid gap-3">
                      <Field label="Pergunta" htmlFor={`et-q-${index}`} error={errors.questions?.[index]?.label?.message}>
                        <Input
                          id={`et-q-${index}`}
                          {...register(`questions.${index}.label` as const)}
                          placeholder="Ex: Qual o motivo da consulta?"
                          className="rounded-xl h-10"
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tipo de resposta" htmlFor={`et-q-type-${index}`}>
                          <select id={`et-q-type-${index}`} {...register(`questions.${index}.type` as const)} className={cn(controlClass, "appearance-none h-10")}>
                            <option value="TEXT">Texto Curto</option>
                            <option value="TEXTAREA">Texto Longo</option>
                            <option value="PHONE">Telefone</option>
                          </select>
                        </Field>

                        <div className="flex items-end pb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              {...register(`questions.${index}.required` as const)}
                              className="h-4 w-4 rounded border-input bg-input-background text-brand-primary focus:ring-brand-primary focus:ring-offset-card"
                            />
                            <span className="text-sm font-medium text-foreground">Obrigatória</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2 pb-1">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl">
              {isSubmitting
                ? "Salvando..."
                : isEditing
                ? "Salvar alterações"
                : "Criar consulta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center"
      >
        <div className={cn(
          "h-5 w-9 rounded-full border transition-all",
          checked ? "bg-brand-primary border-brand-primary" : "bg-switch-background border-border"
        )} />
        <div className={cn(
          "absolute h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-4.5" : "left-0.5"
        )} />
      </button>
    </div>
  )
}
