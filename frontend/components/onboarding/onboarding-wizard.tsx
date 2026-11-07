"use client"

/**
 * Wizard de onboarding Healthtech. NextAuth removido (sem `useSession`).
 * RHF + Zod para validação robusta; transições de etapa com Framer Motion (leve, via `m`).
 * Persistência pelo BFF: PUT /me/profile → POST /me/onboarding/complete → refresh de sessão.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, m } from "motion/react"
import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import { isApiError } from "@/lib/api/problem-details"
import {
  healthProfileSchema,
  type HealthProfileInput,
  COUNCILS,
  TIMEZONES,
  STEP_FIELDS,
} from "@/lib/validators/health-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Stethoscope, IdCard, Settings, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react"
import { PUBLIC_HOST } from "@/lib/site"

const STEPS = [
  { title: "Identidade", icon: Stethoscope },
  { title: "Presença", icon: IdCard },
  { title: "Preferências", icon: Settings },
] as const

const EASE = [0.22, 1, 0.36, 1] as const

export function OnboardingWizard({
  defaultUsername = "",
  defaultTimeZone = "America/Sao_Paulo",
}: {
  defaultUsername?: string
  defaultTimeZone?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<HealthProfileInput>({
    resolver: zodResolver(healthProfileSchema),
    defaultValues: {
      username: defaultUsername,
      timeZone: defaultTimeZone,
      council: "CRM",
    },
  })

  // Detecta o fuso do navegador (sobrescreve o padrão do servidor, se disponível).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) setValue("timeZone", tz)
  }, [setValue])

  async function goNext() {
    const ok = await trigger(STEP_FIELDS[step])
    if (!ok) return
    setDir(1)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  function goBack() {
    setDir(-1)
    setStep((s) => Math.max(s - 1, 0))
  }

  async function onSubmit(values: HealthProfileInput) {
    setFormError(null)
    try {
      await apiClient(endpoints.me.profile, { method: "PUT", body: values })
      await apiClient(endpoints.me.onboardingComplete, { method: "POST" })
      // Rotaciona o token para refletir username/onboarded novos (spec §3.2).
      await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" }).catch(() => null)
      router.replace("/dashboard")
      router.refresh()
    } catch (err) {
      if (isApiError(err) && err.kind === "conflict") {
        setError("username", { message: "Este link já está em uso. Escolha outro." })
        setDir(-1)
        setStep(1)
        return
      }
      if (isApiError(err) && err.kind === "validation") {
        setFormError("Revise os campos destacados e tente novamente.")
        return
      }
      setFormError("Não foi possível concluir agora. Tente novamente em instantes.")
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <Card className="w-full max-w-2xl rounded-2xl border-border/60 p-8 shadow-sm sm:p-10">
      {/* Stepper */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = step > i
          const active = step === i
          return (
            <div key={s.title} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                    done || active ? "bg-brand-primary text-white" : "bg-muted text-muted-foreground"
                  } ${active ? "ring-4 ring-brand-primary/15" : ""}`}
                >
                  {done ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <span className={`hidden text-sm sm:inline ${active || done ? "" : "text-muted-foreground"}`}>
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-3 h-px flex-1 ${done ? "bg-brand-primary" : "bg-border"}`} />
              )}
            </div>
          )
        })}
      </div>
      <Progress value={progress} className="mt-6 h-1" />

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8" noValidate>
        {formError && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {formError}
          </div>
        )}

        <div className="min-h-[300px] overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <m.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.26, ease: EASE }}
            >
              {step === 0 && <StepIdentity register={register} errors={errors} />}
              {step === 1 && <StepPresence register={register} errors={errors} />}
              {step === 2 && <StepPreferences register={register} errors={errors} />}
            </m.div>
          </AnimatePresence>
        </div>

        {/* Navegação */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={goBack} className="rounded-xl">
              <ArrowLeft size={16} className="mr-1" /> Voltar
            </Button>
          ) : (
            <div />
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} className="h-11 rounded-xl px-6">
              Continuar <ArrowRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl px-6">
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-1 animate-spin" /> Concluindo…
                </>
              ) : (
                <>
                  Concluir <Check size={16} className="ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}

/* ── Campos por etapa ─────────────────────────────────────────────────────── */

type FieldProps = {
  register: ReturnType<typeof useForm<HealthProfileInput>>["register"]
  errors: ReturnType<typeof useForm<HealthProfileInput>>["formState"]["errors"]
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

const selectClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"

function StepIdentity({ register, errors }: FieldProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Quem é você profissionalmente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Essas informações ajudam seus pacientes a reconhecer você.
        </p>
      </div>
      <Field label="Nome completo" htmlFor="name" error={errors.name?.message}>
        <Input id="name" className="h-11 rounded-xl" placeholder="Dra. Ana Costa" {...register("name")} />
      </Field>
      <Field label="Especialidade" htmlFor="specialty" error={errors.specialty?.message}>
        <Input id="specialty" className="h-11 rounded-xl" placeholder="Psicologia clínica" {...register("specialty")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Conselho" htmlFor="council" error={errors.council?.message}>
          <select id="council" className={selectClass} {...register("council")}>
            {COUNCILS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Número de registro" htmlFor="registrationNumber" error={errors.registrationNumber?.message}>
          <Input
            id="registrationNumber"
            className="h-11 rounded-xl"
            placeholder="Ex.: 06/12345"
            {...register("registrationNumber")}
          />
        </Field>
      </div>
    </div>
  )
}

function StepPresence({ register, errors }: FieldProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Sua presença de agendamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          É por aqui que os pacientes marcam horário com você.
        </p>
      </div>
      <Field
        label="Link da sua agenda"
        htmlFor="username"
        error={errors.username?.message}
        hint="Você pode alterar depois nas configurações."
      >
        <div className="flex items-center overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring/30">
          <span className="border-r border-input bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {PUBLIC_HOST}/
          </span>
          <input
            id="username"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            placeholder="dra-ana"
            {...register("username")}
          />
        </div>
      </Field>
      <Field label="Clínica ou consultório (opcional)" htmlFor="clinicName" error={errors.clinicName?.message}>
        <Input id="clinicName" className="h-11 rounded-xl" placeholder="Clínica Vida" {...register("clinicName")} />
      </Field>
      <Field
        label="Bio (opcional)"
        htmlFor="bio"
        error={errors.bio?.message}
        hint="Uma frase curta e acolhedora sobre o seu trabalho."
      >
        <textarea
          id="bio"
          rows={3}
          maxLength={160}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="Atendimento humanizado com foco em terapia cognitivo-comportamental."
          {...register("bio")}
        />
      </Field>
    </div>
  )
}

function StepPreferences({ register, errors }: FieldProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Ajustes finais</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirme seu fuso horário para que os horários apareçam corretos.
        </p>
      </div>
      <Field
        label="Fuso horário"
        htmlFor="timeZone"
        error={errors.timeZone?.message}
        hint="Detectado automaticamente pelo seu navegador — ajuste se necessário."
      >
        <select id="timeZone" className={selectClass} {...register("timeZone")}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace("America/", "").replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      <div className="rounded-xl border border-care/30 bg-care/10 p-4 text-sm text-foreground/80">
        Tudo pronto! Ao concluir, você poderá configurar seus tipos de consulta e ativar seus
        recebimentos.
      </div>
    </div>
  )
}
