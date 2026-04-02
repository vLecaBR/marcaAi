"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { teamSchema, type TeamInput } from "@/lib/validators/team"
import { upsertTeamAction } from "@/lib/actions/team"
import { cn } from "@/lib/utils"

interface TeamFormProps {
  open: boolean
  onClose: () => void
  defaultValues?: Partial<TeamInput> & { id?: string }
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

export function TeamForm({ open, onClose, defaultValues }: TeamFormProps) {
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
  } = useForm<TeamInput>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      theme: "DARK",
      brandColor: "#7c3aed",
      ...defaultValues,
    },
  })

  const nameValue = watch("name")

  useEffect(() => {
    if (!isEditing) {
      setValue("slug", slugify(nameValue ?? ""), { shouldValidate: false })
    }
  }, [nameValue, isEditing, setValue])

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        slug: "",
        description: "",
        ...defaultValues,
      })
      setServerError(null)
    }
  }, [open, defaultValues, reset])

  async function onSubmit(data: TeamInput) {
    setServerError(null)
    const payload = defaultValues?.id
      ? { ...data, id: defaultValues.id }
      : data

    const result = await upsertTeamAction(payload)

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {isEditing ? "Editar Equipe" : "Nova Equipe"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Nome da Equipe</label>
            <input {...register("name")} placeholder="Ex: Barbearia do Zé" className={inputClass} />
            {errors.name && <p className="text-xs text-rose-400">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Slug (URL)</label>
            <input {...register("slug")} placeholder="barbearia-do-ze" className={inputClass} />
            <p className="text-xs text-zinc-600">Aparece na URL: marcaai.com/equipe/slug</p>
            {errors.slug && <p className="text-xs text-rose-400">{errors.slug.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Descrição (opcional)</label>
            <textarea
              {...register("description")}
              placeholder="Sobre a equipe..."
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
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
                  className={cn(inputClass, errors.brandColor && "border-rose-500/60 focus:border-rose-500")}
                />
              </div>
              {errors.brandColor && (
                <p className="text-xs text-rose-400">{errors.brandColor.message}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
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
                "flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500 active:scale-[0.99]",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              {isSubmitting ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar equipe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
