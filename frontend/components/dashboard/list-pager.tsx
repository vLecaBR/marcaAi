import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface ListPagerProps {
  /** Caminho da página (ex.: `/dashboard/patients`). */
  basePath: string
  /** Outros parâmetros que devem sobreviver à troca de página (busca, aba…). */
  params?: Record<string, string>
  page: number
  pageSize: number
  total: number
  /** Plural do que está sendo listado, para o texto "21–40 de 135 pacientes". */
  noun: string
}

/** Paginação por links (funciona sem JavaScript; a página é renderizada no servidor). Some quando cabe numa página só. */
export function ListPager({ basePath, params = {}, page, pageSize, total, noun }: ListPagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null

  const href = (p: number) => {
    const qs = new URLSearchParams({ ...params, page: String(p) })
    return `${basePath}?${qs.toString()}`
  }
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const linkClass = "inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"
  const disabledClass = "inline-flex h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-sm text-muted-foreground/50"

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
      <span className="text-muted-foreground" aria-live="polite">
        {from}–{to} de {total} {noun} · página {page} de {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} rel="prev" className={linkClass}><ChevronLeft size={14} aria-hidden /> Anterior</Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}><ChevronLeft size={14} aria-hidden /> Anterior</span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} rel="next" className={linkClass}>Próxima <ChevronRight size={14} aria-hidden /></Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>Próxima <ChevronRight size={14} aria-hidden /></span>
        )}
      </span>
    </nav>
  )
}
