"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
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

interface ProfileFormProps {
  user: {
    name: string | null
    username: string | null
    timeZone: string
    bio: string | null
    image: string | null
    email: string
    theme?: string
    brandColor?: string | null
  }
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const router = useRouter()

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
      theme: (user.theme as any) ?? "DARK",
      brandColor: user.brandColor ?? "#7c3aed",
    },
  })

  const usernameValue = watch("username")

  async function onSubmit(data: ProfileInput) {
    setServerError(null)
    setSuccessMsg(null)
    const result = await completeProfileAction(data)
    
    if (result.success) {
      setSuccessMsg("Perfil atualizado com sucesso!")
      router.refresh()
    } else {
      setServerError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm text-rose-400">{serverError}</p>
        </div>
      )}
      
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-400">{successMsg}</p>
        </div>
      )}

      {/* Avatar preview */}
      {user.image && (
        <div className="flex items-center gap-4">
          <img
            src={user.image}
            alt={user.name ?? "Avatar"}
            className="h-14 w-14 rounded-full ring-2 ring-zinc-700 object-cover"
          />
          <div>
            <p className="text-sm font-medium text-white">{user.email}</p>
            <p className="text-xs text-zinc-500">A foto é sincronizada automaticamente com a conta Google</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Nome */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Nome de Exibição
          </label>
          <input
            {...register("name")}
            placeholder="Ex: João da Barbearia"
            className={cn(inputClass, errors.name && errorInputClass)}
          />
          {errors.name && (
            <p className="text-xs text-rose-400">{errors.name.message}</p>
          )}
        </div>

        {/* Username */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Username Público
          </label>
          <div className="flex rounded-xl overflow-hidden border border-zinc-700 bg-zinc-800 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all">
            <span className="flex items-center px-3 text-sm text-zinc-500 bg-zinc-800/50 border-r border-zinc-700 select-none">
              marcaai.com/
            </span>
            <input
              {...register("username")}
              placeholder="seu-username"
              className="flex-1 w-full bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600"
            />
          </div>
          {errors.username ? (
            <p className="text-xs text-rose-400">{errors.username.message}</p>
          ) : (
            usernameValue && (
              <p className="text-xs text-zinc-500">
                Sua url pública: <span className="text-violet-400">marcaai.com/{usernameValue}</span>
              </p>
            )
          )}
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-300">
          Fuso Horário Padrão
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
          Biografia ou Descrição{" "}
          <span className="text-zinc-500 font-normal">(opcional)</span>
        </label>
        <textarea
          {...register("bio")}
          placeholder="Breve descrição sobre você ou seu trabalho..."
          rows={4}
          className={cn(inputClass, "resize-none")}
        />
        {errors.bio && (
          <p className="text-xs text-rose-400">{errors.bio.message}</p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Theme */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Tema Público
          </label>
          <select
            {...register("theme")}
            className={cn(inputClass, "appearance-none")}
          >
            <option value="DARK">Escuro (Dark Mode)</option>
            <option value="LIGHT">Claro (Light Mode)</option>
            <option value="SYSTEM">Sistema (Automático)</option>
          </select>
          {errors.theme && (
            <p className="text-xs text-rose-400">{errors.theme.message}</p>
          )}
        </div>

        {/* Brand Color */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-300">
            Cor da Marca (Hex)
          </label>
          <div className="flex gap-3">
            <input
              type="color"
              {...register("brandColor")}
              className="h-10 w-14 rounded-xl cursor-pointer border-0 p-0"
            />
            <input
              type="text"
              {...register("brandColor")}
              placeholder="#7c3aed"
              className={cn(inputClass, errors.brandColor && errorInputClass)}
            />
          </div>
          {errors.brandColor && (
            <p className="text-xs text-rose-400">{errors.brandColor.message}</p>
          )}
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-medium text-white",
            "transition-all hover:bg-violet-500 active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
            "disabled:opacity-50 disabled:pointer-events-none"
          )}
        >
          {isSubmitting ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>
    </form>
  )
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all focus:border-violet-500 focus:ring-1 focus:ring-violet-500"

const errorInputClass = "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500"
