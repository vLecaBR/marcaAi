"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { formatInTimeZone } from "date-fns-tz"
import { ptBR } from "date-fns/locale"
import { format } from "date-fns"
import type { Slot } from "@/lib/scheduling/types"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react"

const bookingFormSchema = z.object({
  name:  z.string().min(2, "Nome deve ter ao menos 2 caracteres."),
  email: z.string().email("E-mail inválido."),
  phone: z.string().optional(),
  notes: z.string().max(500).optional(),
  responses: z.record(z.string(), z.string()).optional(),
  recurringCount: z.number().int().min(1).max(52).optional(),
})

type BookingFormInput = z.infer<typeof bookingFormSchema>

interface BookingFormProps {
  slot: Slot
  eventType: {
    id: string; title: string; duration: number
    locationType: string; requiresConfirm: boolean
    questions?: any[]
  }
  owner: { id: string; name: string | null }
  viewerTimeZone: string
  onBack: () => void
}

type BookingResult =
  | { status: "success"; requiresConfirm: boolean; pixData?: any }
  | { status: "conflict" }
  | { status: "error"; message: string }

export function BookingForm({
  slot,
  eventType,
  owner,
  viewerTimeZone,
  onBack,
}: BookingFormProps) {
  const [result, setResult] = useState<BookingResult | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInput>({
    resolver: zodResolver(bookingFormSchema),
  })

  const timeLabel = formatInTimeZone(slot.startUtc, viewerTimeZone, "HH:mm")
  const dateLabel = format(
    new Date(
      formatInTimeZone(slot.startUtc, viewerTimeZone, "yyyy-MM-dd") + "T12:00:00"
    ),
    "EEEE, d 'de' MMMM 'de' yyyy",
    { locale: ptBR }
  )

  async function onSubmit(data: BookingFormInput) {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId:   eventType.id,
        ownerId:       owner.id,
        startTimeUtc:  new Date(slot.startUtc).toISOString(),
        endTimeUtc:    new Date(slot.endUtc).toISOString(),
        guestTimeZone: viewerTimeZone,
        guestName:     data.name,
        guestEmail:    data.email,
        guestPhone:    data.phone,
        guestNotes:    data.notes,
        responses:     data.responses ? Object.entries(data.responses).map(([questionId, answer]) => ({ questionId, answer })) : [],
        recurringCount: data.recurringCount ?? 1,
      }),
    })

    const json = await res.json()

    if (res.status === 409) {
      setResult({ status: "conflict" })
    } else if (!res.ok) {
      setResult({ status: "error", message: json.message ?? json.error ?? "Erro ao agendar." })
    } else {
      setResult({
        status: "success",
        requiresConfirm: eventType.requiresConfirm,
      })
    }
  }

  // Tela de sucesso
  if (result?.status === "success") {
    if (result.pixData) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Pagamento via Pix</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Escaneie o QR Code abaixo no app do seu banco para confirmar o agendamento.
          </p>

          <div className="mt-6 rounded-2xl bg-white border border-border p-4 shadow-sm">
            <img 
              src={`data:image/png;base64,${result.pixData.qrCodeBase64}`} 
              alt="QR Code Pix" 
              className="w-48 h-48"
            />
          </div>

          <div className="mt-6 w-full space-y-2 text-left">
            <p className="text-xs font-medium text-muted-foreground">Pix Copia e Cola:</p>
            <div className="relative">
              <Input
                readOnly
                value={result.pixData.qrCode}
                className="w-full pr-12 text-xs font-mono"
              />
              <Button 
                variant="ghost"
                size="icon"
                onClick={() => navigator.clipboard.writeText(result.pixData.qrCode)}
                className="absolute right-1 top-1 h-7 w-7"
                title="Copiar"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </Button>
            </div>
            {result.requiresConfirm && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 text-center">
                Após o pagamento, o agendamento irá para aprovação manual.
              </p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold">
          {result.requiresConfirm ? "Solicitação enviada!" : "Agendamento confirmado!"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.requiresConfirm
            ? `${owner.name} receberá sua solicitação e confirmará em breve.`
            : "Você receberá um e-mail de confirmação com os detalhes."}
        </p>
        <div className="mt-6 w-full rounded-xl border border-border bg-muted/30 px-6 py-4 text-left space-y-1">
          <p className="text-sm font-medium">{eventType.title}</p>
          <p className="text-xs capitalize text-muted-foreground">{dateLabel}</p>
          <p className="text-xs text-muted-foreground">{timeLabel} · {eventType.duration} min</p>
        </div>
      </div>
    )
  }

  // Tela de conflito
  if (result?.status === "conflict") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-semibold">
          Horário indisponível
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Este horário acabou de ser reservado por outra pessoa. Por favor, escolha outro.
        </p>
        <Button onClick={onBack} className="mt-6 rounded-xl w-full h-11">
          Escolher outro horário
        </Button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
        <ArrowLeft size={14}/> Trocar horário
      </button>
      
      <h3 className="mb-5 text-lg font-semibold">Preencha seus dados</h3>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
        {result?.status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{result.message}</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Nome *</label>
          <Input
            {...register("name")}
            placeholder="Seu nome"
            className="mt-1.5 h-11 rounded-xl"
          />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">E-mail *</label>
          <Input
            {...register("email")}
            type="email"
            placeholder="seu@email.com"
            className="mt-1.5 h-11 rounded-xl"
          />
          {errors.email && (
            <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">
            Telefone <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            {...register("phone")}
            placeholder="+55 (11) 99999-9999"
            className="mt-1.5 h-11 rounded-xl"
          />
        </div>

        <div>
          <label className="text-sm font-medium">
            Compartilhe qualquer coisa que ajude a preparar a reunião <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Textarea
            {...register("notes")}
            placeholder="Opcional — no que devemos focar?"
            rows={3}
            className="mt-1.5 rounded-xl"
          />
        </div>

        {eventType.questions && eventType.questions.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-border mt-6">
            <h3 className="text-sm font-medium">Perguntas adicionais</h3>
            {eventType.questions.map((q: any) => (
              <div key={q.id}>
                <label className="text-sm font-medium">
                  {q.label}{" "}
                  {!q.required && <span className="text-muted-foreground font-normal">(opcional)</span>}
                </label>
                
                {q.type === "TEXTAREA" ? (
                  <Textarea
                    {...register(`responses.${q.id}` as any, { required: q.required ? "Campo obrigatório" : false })}
                    placeholder={q.placeholder ?? ""}
                    rows={3}
                    className="mt-1.5 rounded-xl"
                  />
                ) : (
                  <Input
                    {...register(`responses.${q.id}` as any, { required: q.required ? "Campo obrigatório" : false })}
                    type={q.type === "PHONE" ? "tel" : "text"}
                    placeholder={q.placeholder ?? ""}
                    className="mt-1.5 h-11 rounded-xl"
                  />
                )}
                {errors.responses?.[q.id] && (
                  <p className="text-xs text-destructive mt-1">{(errors.responses[q.id] as any).message}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={isSubmitting} className="w-full h-11 rounded-xl">
            {isSubmitting
              ? "Agendando..."
              : eventType.requiresConfirm
              ? "Solicitar agendamento"
              : "Confirmar agendamento"}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Ao confirmar, você concorda com nossos <a href="/termos" className="underline">Termos</a> e <a href="/privacidade" className="underline">Política de Privacidade</a>.
          </p>
        </div>
      </form>
    </div>
  )
}