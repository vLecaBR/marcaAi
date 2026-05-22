"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { profileSchema, type ProfileInput } from "@/lib/validators/onboarding"
import { completeProfileAction } from "@/lib/actions/onboarding"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

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

  const userInitials = user.name?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase() || "U"

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {serverError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}
      
      {successMsg && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMsg}</p>
        </div>
      )}

      {/* Avatar preview */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-7 border-b border-border/60">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name ?? "Avatar"}
            className="h-20 w-20 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white" style={{ fontSize: 26, fontWeight: 600 }}>
            {userInitials}
          </div>
        )}
        <div>
          <h3 className="font-semibold text-foreground">Foto de perfil</h3>
          <p className="text-sm text-muted-foreground mt-1">Sincronizada automaticamente com a conta Google.</p>
        </div>
      </div>

      <div className="pt-7 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Nome */}
        <div>
          <label className="text-sm font-medium">Nome completo</label>
          <Input
            {...register("name")}
            placeholder="Ex: Ana Costa"
            className="mt-1.5 h-11 rounded-xl"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* E-mail (Disabled, só exibição pra bater com o mockup) */}
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input
            defaultValue={user.email}
            readOnly
            disabled
            className="mt-1.5 h-11 rounded-xl"
          />
        </div>

        {/* Username */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">URL de agendamento</label>
          <div className="mt-1.5 flex items-center rounded-xl border border-input overflow-hidden focus-within:ring-3 focus-within:ring-ring/50 focus-within:border-ring transition-[color,box-shadow]">
            <span className="px-3 py-2.5 bg-muted text-sm text-muted-foreground border-r border-input h-11 flex items-center">marca-ai-app.vercel.app/</span>
            <input
              {...register("username")}
              placeholder="anacosta"
              className="flex-1 h-11 px-3 py-2.5 bg-input-background outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
          {errors.username && (
            <p className="mt-1 text-xs text-destructive">{errors.username.message}</p>
          )}
        </div>

        {/* Bio */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Bio</label>
          <Textarea
            {...register("bio")}
            placeholder="Breve descrição sobre você ou seu trabalho..."
            rows={4}
            className="mt-1.5 rounded-xl"
          />
          {errors.bio && (
            <p className="mt-1 text-xs text-destructive">{errors.bio.message}</p>
          )}
        </div>

        {/* Timezone */}
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Fuso horário</label>
          <select
            {...register("timeZone")}
            className="mt-1.5 h-11 w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          {errors.timeZone && (
            <p className="mt-1 text-xs text-destructive">{errors.timeZone.message}</p>
          )}
        </div>

        {/* Theme and Color (Extra) */}
        <div>
          <label className="text-sm font-medium">Tema Público</label>
          <select
            {...register("theme")}
            className="mt-1.5 h-11 w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="DARK">Escuro (Dark Mode)</option>
            <option value="LIGHT">Claro (Light Mode)</option>
            <option value="SYSTEM">Sistema (Automático)</option>
          </select>
          {errors.theme && (
            <p className="mt-1 text-xs text-destructive">{errors.theme.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Cor da Marca (Hex)</label>
          <div className="mt-1.5 flex gap-3 h-11">
            <input
              type="color"
              {...register("brandColor")}
              className="h-11 w-14 rounded-xl cursor-pointer border-0 p-0"
            />
            <Input
              type="text"
              {...register("brandColor")}
              placeholder="#7c3aed"
              className="h-11 rounded-xl flex-1"
            />
          </div>
          {errors.brandColor && (
            <p className="mt-1 text-xs text-destructive">{errors.brandColor.message}</p>
          )}
        </div>
      </div>

      <div className="mt-7 pt-6 border-t border-border/60 flex items-center justify-end gap-2">
        <Button variant="ghost" className="rounded-xl h-11" type="button">Cancelar</Button>
        <Button className="rounded-xl h-11 px-6" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}