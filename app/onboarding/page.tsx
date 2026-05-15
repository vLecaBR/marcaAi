"use client"

import { useState, useEffect } from "react"
import { submitOnboarding } from "./actions"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

export default function OnboardingPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [timeZone, setTimeZone] = useState("America/Sao_Paulo")

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    
    try {
      const result = await submitOnboarding(formData)
      
      if (result.error) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      if (result.success) {
        // Atualiza a sessão no cliente e redireciona
        await update({ onboarded: true })
        router.push("/dashboard")
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado.")
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-zinc-900 p-8 shadow-2xl ring-1 ring-white/10">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">Bem-vindo(a)!</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Vamos configurar o seu perfil para começar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-500/10 p-4 text-sm text-red-500 border border-red-500/20">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium leading-6 text-white">
              Nome de Usuário (URL)
            </label>
            <div className="mt-2 flex rounded-md bg-zinc-800 shadow-sm ring-1 ring-inset ring-white/10 focus-within:ring-2 focus-within:ring-inset focus-within:ring-violet-500">
              <span className="flex select-none items-center pl-3 text-zinc-500 sm:text-sm">
                marcaai.com/
              </span>
              <input
                type="text"
                name="username"
                id="username"
                required
                className="block flex-1 border-0 bg-transparent py-1.5 pl-1 text-white focus:ring-0 sm:text-sm sm:leading-6"
                placeholder="seunome"
              />
            </div>
          </div>

          <div>
            <label htmlFor="timeZone" className="block text-sm font-medium leading-6 text-white">
              Fuso Horário
            </label>
            <div className="mt-2">
              <input
                type="text"
                name="timeZone"
                id="timeZone"
                readOnly
                value={timeZone}
                className="block w-full rounded-md border-0 bg-zinc-800 py-1.5 text-zinc-400 shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-violet-500 sm:text-sm sm:leading-6 px-3 cursor-not-allowed opacity-75"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">Detectado automaticamente pelo seu navegador.</p>
          </div>

          <div>
            <label htmlFor="theme" className="block text-sm font-medium leading-6 text-white">
              Tema de Preferência
            </label>
            <div className="mt-2">
              <select
                id="theme"
                name="theme"
                className="block w-full rounded-md border-0 bg-zinc-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-violet-500 sm:text-sm sm:leading-6 px-3"
                defaultValue="DARK"
              >
                <option value="DARK">Escuro</option>
                <option value="LIGHT">Claro</option>
                <option value="SYSTEM">Sistema</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full justify-center rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Salvando..." : "Concluir Configuração"}
          </button>
        </form>
      </div>
    </div>
  )
}