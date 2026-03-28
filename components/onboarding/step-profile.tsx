"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { profileSchema, type ProfileInput } from "@/lib/validators/onboarding"
import { completeProfileAction } from "@/lib/actions/onboarding"
import { cn } from "@/lib/utils"

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
  { value: "America/New_York", label: "Nova York (GMT-5)" },
  { value: "America/Chicago", label: "Chicago (GMT-6)" },
  { value: "America/Denver", label: "Denver (GMT-7)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8)" },
  { value: "Europe/Lisbon", label: "Lisboa (GMT+0)" },
  { value: "Europe/London", label: "Londres (GMT+0)" },
  { value: "Europe/Madrid", label: "Madri (GMT+1)" },
  { value: "UTC", label: "UTC (GMT+0)" },
]

interface StepProfileProps {
  user: {
    name: string | null
    username: string | null
    timeZone: string
    bio: string | null
    image: string | null
    email: string
  }
  onSuccess: () => void
}

export function StepProfile({ user, onSuccess }: StepProfileProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name ?? "",
      username: user.username ?? "",
      timeZone: user.timeZone ?? "America/Sao_Paulo",
      bio: user.bio ?? "",
    },
  })

  const usernameValue = watch("username")

  async function onSubmit(data: ProfileInput) {
    setServerError(null)
    const result = await completeProfileAction(data)
    if (result.success) {
      onSuccess()
    } else {
      setServerError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Seu perfil</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Estas informações aparecem na sua página pública de agendamento.
        </p>
      </div>

      {serverError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm text-rose-400">{serverError}</p>
        </div>
      )}

      {/* Avatar preview */}
      {user.image && (
        <div className="flex items-center gap-4">
          <img
            src={user.image}
            alt={user.name ?? "Avatar"}
            className="h-14 w-14 rounded-full ring-2 ring-zinc-700"
          />
          <div>
            <p className="text-sm font-medium text-white">{user.email}</p>
            <p className="text-xs text-zinc-500">Foto sincronizada com o Google</p>
          </div>
        </div>
      )}

      {/* Nome */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">
          Nome completo
        </label>
        <input
          {...register("name")}
          placeholder="Seu nome"
          className={cn(inputClass, errors.name && errorInputClass)}
        />
        {errors.name && (
          <p className="text-xs text-rose-400">{errors.name.message}</p>
        )}
      </div>

      {/* Username */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">
          Username público
        </label>
        <div className="flex rounded-xl overflow-hidden border border-zinc-700 bg-zinc-800 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all">
          <span className="flex items-center px-3 text-sm text-zinc-500 bg-zinc-800/50 border-r border-zinc-700 select-none">
            peopleos.app/
          </span>
          <input
            {...register("username")}
            placeholder="seu-username"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600"
          />
        </div>
        {errors.username ? (
          <p className="text-xs text-rose-400">{errors.username.message}</p>
        ) : (
          usernameValue && (
            <p className="text-xs text-zinc-500">
              peopleos.app/<span className="text-violet-400">{usernameValue}</span>
            </p>
          )
        )}
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">
          Fuso horário
        </label>
        <select
          {...register("timeZone")}
          className={cn(inputClass, "appearance-none")}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        {errors.timeZone && (
          <p className="text-xs text-rose-400">{errors.timeZone.message}</p>
        )}
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">
          Bio{" "}
          <span className="text-zinc-500 font-normal">(opcional)</span>
        </label>
        <textarea
          {...register("bio")}
          placeholder="Breve descrição sobre você ou seu trabalho..."
          rows={3}
          className={cn(inputClass, "resize-none")}
        />
        {errors.bio && (
          <p className="text-xs text-rose-400">{errors.bio.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white",
          "transition-all hover:bg-violet-500 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
          "disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        {isSubmitting ? "Salvando..." : "Continuar →"}
      </button>
    </form>
  )
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all focus:border-violet-500 focus:ring-1 focus:ring-violet-500"

const errorInputClass = "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500"