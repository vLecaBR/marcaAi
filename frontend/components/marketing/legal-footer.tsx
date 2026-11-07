import Link from "next/link"

/**
 * Rodapé legal: links para Termos/Privacidade e canal do encarregado (DPO).
 * O e-mail vem de `DPO_EMAIL` (server-only, lido em runtime). Sem valor, mostra aviso "em definição".
 */
export function LegalFooter() {
  const dpo = process.env.DPO_EMAIL?.trim()
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <Link href="/termos" className="underline underline-offset-2">Termos de uso</Link>
      <Link href="/privacidade" className="underline underline-offset-2">Política de Privacidade</Link>
      {dpo ? (
        <span>
          Encarregado (LGPD): <a href={`mailto:${dpo}`} className="underline underline-offset-2">{dpo}</a>
        </span>
      ) : (
        <span>Encarregado (LGPD): canal em definição</span>
      )}
    </div>
  )
}
