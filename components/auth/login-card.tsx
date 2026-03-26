"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface LoginCardProps {
  callbackUrl?: string
  error?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: "Este e-mail já está vinculado a outro método de login.",
  AccessDenied: "Acesso negado. Verifique suas permissões.",
  Default: "Ocorreu um erro. Tente novamente.",
}

export function LoginCard({ callbackUrl, error }: LoginCardProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoogleSignIn() {
    setIsLoading(true)
    await signIn("google", {
      callbackUrl: callbackUrl ?? "/dashboard",
    })
  }

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default)
    : null

  return (
    <div className="w-full max-w-sm space-y-8">
      {/* Logo / Wordmark */}
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
            <svg
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
              />
            </svg>
          </span>
          <span className="text-xl font-semibold tracking-tight text-white">
            People <span className="text-violet-400">OS</span>
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          Agendamento inteligente, experiência premium.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-sm">
        <div className="space-y-1 mb-8">
          <h1 className="text-lg font-semibold text-white">Bem-vindo de volta</h1>
          <p className="text-sm text-zinc-400">
            Entre com sua conta Google para continuar.
          </p>
        </div>

        {/* Erro */}
        {errorMessage && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
            <p className="text-sm text-rose-400">{errorMessage}</p>
          </div>
        )}

        {/* Botão Google */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className={cn(
            "relative flex w-full items-center justify-center gap-3 rounded-xl",
            "border border-zinc-700 bg-zinc-800 px-4 py-3",
            "text-sm font-medium text-white",
            "transition-all duration-200",
            "hover:border-zinc-600 hover:bg-zinc-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          {isLoading ? (
            <svg
              className="h-4 w-4 animate-spin text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <GoogleIcon />
          )}
          {isLoading ? "Entrando..." : "Continuar com Google"}
        </button>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Ao entrar, você concorda com os{" "}
          <a href="/terms" className="text-zinc-400 underline-offset-4 hover:underline">
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a href="/privacy" className="text-zinc-400 underline-offset-4 hover:underline">
            Política de Privacidade
          </a>
          .
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
