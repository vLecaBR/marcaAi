/**
 * Idempotency-Key (POST /bookings e POST /bookings/{uid}/pay). Uma chave por TENTATIVA: duplo clique e retry de rede reenviam a
 * mesma chave (a API devolve a mesma resposta, sem criar outra consulta/cobrança); depois de qualquer resposta HTTP a chave é
 * trocada, para que o paciente possa corrigir um dado e enviar de novo sem bater em "chave já usada com outro conteúdo".
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key"

/** Mesmo formato aceito pela API: 8 a 64 caracteres entre letras, números, `_` e `-`. */
const VALID = /^[A-Za-z0-9_-]{8,64}$/

export function isValidIdempotencyKey(key: string | null | undefined): key is string {
  return typeof key === "string" && VALID.test(key)
}

/** Gera uma chave nova (UUID v4 do navegador/Node; cai para aleatório simples se `crypto.randomUUID` não existir). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const bytes = new Uint8Array(16)
  c?.getRandomValues?.(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
