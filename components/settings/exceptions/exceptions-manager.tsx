"use client"

import { useState } from "react"
import { Calendar as CalendarIcon, Trash2, Plus, CalendarOff, Palmtree } from "lucide-react"
import { addExceptionAction, removeExceptionAction } from "@/lib/actions/exceptions"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function ExceptionsManager({ 
  scheduleId, 
  exceptions 
}: { 
  scheduleId: string, 
  exceptions: any[] 
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [date, setDate] = useState("")
  const [type, setType] = useState<"BLOCKED" | "VACATION">("BLOCKED")
  const [reason, setReason] = useState("")

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setError(null)
    setLoading(true)

    const result = await addExceptionAction({ scheduleId, date, type, reason })

    if (result.success) {
      setDate("")
      setReason("")
      setType("BLOCKED")
      setOpen(false)
    } else {
      setError(result.error ?? "Erro ao adicionar bloqueio.")
    }
    setLoading(false)
  }

  async function handleRemove(id: string) {
    if (!confirm("Tem certeza que deseja remover este bloqueio?")) return
    
    setLoading(true)
    const result = await removeExceptionAction(id)
    if (!result.success) {
      alert(result.error ?? "Erro ao remover bloqueio.")
    }
    setLoading(false)
  }

  // Ordenar por data crescente
  const sortedExceptions = [...exceptions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const upcomingExceptions = sortedExceptions.filter(
    (ex) => new Date(ex.date).getTime() >= new Date().setHours(0, 0, 0, 0)
  )

  return (
    <Card className="p-6 rounded-2xl border-border/60 h-fit shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-lg">Exceções</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-lg gap-1">
              <Plus size={14}/> Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Novo Bloqueio</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                Adicione datas em que você não poderá atender. O dia inteiro será bloqueado.
              </p>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Data</label>
                  <Input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Tipo</label>
                  <div className="flex rounded-xl bg-muted/50 border border-border/60 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setType("BLOCKED")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
                        type === "BLOCKED" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <CalendarOff className="h-4 w-4" /> Folga
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("VACATION")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
                        type === "VACATION" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <Palmtree className="h-4 w-4" /> Férias
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Motivo (opcional)</label>
                  <Input
                    type="text"
                    placeholder="Ex: Feriado Nacional, Viagem..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={loading || !date}
                  className="rounded-xl"
                >
                  {loading ? "Adicionando..." : "Adicionar Bloqueio"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <p className="text-sm text-muted-foreground mb-5">Feriados ou mudanças pontuais.</p>

      {upcomingExceptions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center bg-muted/30 rounded-xl">
          Nenhuma exceção futura.
        </div>
      ) : (
        <div className="space-y-2">
          {upcomingExceptions.map((ex) => (
            <div key={ex.id} className="p-3 rounded-xl border border-border/60 flex items-start gap-3 hover:bg-muted/30 transition-colors">
              <CalendarIcon size={16} className={`mt-0.5 shrink-0 ${ex.type === "BLOCKED" ? "text-destructive" : "text-amber-500"}`}/>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ fontWeight: 500 }}>
                  {format(new Date(ex.date + "T12:00:00"), "d 'de' MMM, yyyy", { locale: ptBR })}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {ex.reason || (ex.type === "VACATION" ? "Férias" : "Folga/Bloqueado")}
                </div>
              </div>
              <button 
                className="text-muted-foreground hover:text-destructive p-1 rounded-md shrink-0"
                onClick={() => handleRemove(ex.id)}
                disabled={loading}
              >
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}