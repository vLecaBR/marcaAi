#!/usr/bin/env node
/**
 * Pré-voo da V3 (provas com Stripe, Resend e Google reais em modo teste). Lê o `.env.prod`, confere formato e coerência das
 * chaves SEM imprimir segredos e, com `--online`, faz consultas SOMENTE-LEITURA com as suas próprias chaves (Stripe: dados da
 * conta; Resend: situação do domínio). Também confere o DNS do remetente (SPF, DKIM, DMARC).
 *
 *   node scripts/v3-readiness.mjs                 # confere o .env.prod
 *   node scripts/v3-readiness.mjs --env .env.prod --online
 * Sai com código 1 se houver item bloqueante.
 */
import { readFileSync, existsSync } from "node:fs"
import { resolveTxt, resolveCname } from "node:dns/promises"
import { parseArgs } from "node:util"

const { values: o } = parseArgs({ options: { env: { type: "string", default: ".env.prod" }, online: { type: "boolean", default: false } } })

if (!existsSync(o.env)) {
  console.error(`Arquivo ${o.env} não encontrado. Copie .env.prod.example e preencha.`)
  process.exit(2)
}
const env = Object.fromEntries(
  readFileSync(o.env, "utf8").split(/\r?\n/).filter((l) => /^\s*[A-Z0-9_]+=/.test(l)).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  }),
)
const v = (k) => env[k] ?? ""
const mask = (s) => (s.length > 10 ? `${s.slice(0, 6)}…(${s.length})` : s ? "***" : "(vazio)")

const itens = [] // { nivel: "erro"|"aviso"|"ok", msg }
const ok = (m) => itens.push({ nivel: "ok", msg: m })
const erro = (m) => itens.push({ nivel: "erro", msg: m })
const aviso = (m) => itens.push({ nivel: "aviso", msg: m })
const exige = (cond, bom, ruim, nivel = erro) => (cond ? ok(bom) : nivel(ruim))

// ── URLs e segredos básicos ──────────────────────────────────────────────
for (const k of ["APP_PUBLIC_URL", "API_PUBLIC_URL"]) exige(/^https:\/\/[^/\s]+/.test(v(k)), `${k} é https`, `${k} precisa ser uma URL https (hoje: ${v(k) || "vazio"})`)
exige(Buffer.byteLength(v("JWT_SIGNING_KEY")) >= 32 && !/dev|secret|changeme/i.test(v("JWT_SIGNING_KEY")), "JWT_SIGNING_KEY forte", "JWT_SIGNING_KEY ausente, curta (<32 bytes) ou com cara de valor de desenvolvimento (gere com openssl rand -base64 64)")
exige(v("POSTGRES_PASSWORD").length >= 16 && !/TROQUE/i.test(v("POSTGRES_PASSWORD")), "POSTGRES_PASSWORD forte", "POSTGRES_PASSWORD fraca ou ainda o texto de exemplo")

// ── E-mail (Resend) ──────────────────────────────────────────────────────
exige(/^re_[A-Za-z0-9_]+$/.test(v("RESEND_API_KEY")), `RESEND_API_KEY ok (${mask(v("RESEND_API_KEY"))})`, "RESEND_API_KEY ausente ou fora do formato re_… (a API de produção não sobe sem ela)")
const from = v("RESEND_FROM_EMAIL")
const dominio = (/<([^>]+)>/.exec(from)?.[1] ?? from).split("@")[1]?.trim().toLowerCase()
exige(!!dominio && !/resend\.dev$/.test(dominio), `remetente no domínio ${dominio}`, "RESEND_FROM_EMAIL precisa ser de um domínio verificado (não resend.dev)")

// ── Stripe ───────────────────────────────────────────────────────────────
const sk = v("STRIPE_SECRET_KEY")
if (!sk) aviso("Stripe não configurado (cobrança e assinatura ficam desligadas) — necessário para a V3")
else {
  exige(/^sk_(test|live)_/.test(sk), `STRIPE_SECRET_KEY ok (${mask(sk)}, modo ${sk.startsWith("sk_test_") ? "TESTE" : "LIVE"})`, "STRIPE_SECRET_KEY fora do formato sk_test_/sk_live_")
  if (sk.startsWith("sk_live_")) aviso("Chave LIVE: a V3 deve usar sk_test_ (live só depois da V5)")
  exige(/^whsec_/.test(v("STRIPE_WEBHOOK_SECRET")), "STRIPE_WEBHOOK_SECRET ok", "STRIPE_WEBHOOK_SECRET ausente (a API recusa subir com SecretKey sem os dois webhooks)")
  exige(/^whsec_/.test(v("STRIPE_CONNECT_WEBHOOK_SECRET")), "STRIPE_CONNECT_WEBHOOK_SECRET ok", "STRIPE_CONNECT_WEBHOOK_SECRET ausente")
  exige(/^pk_(test|live)_/.test(v("STRIPE_PUBLISHABLE_KEY")), "STRIPE_PUBLISHABLE_KEY ok", "STRIPE_PUBLISHABLE_KEY ausente (o formulário de cartão não renderiza)")
  if (sk.startsWith("sk_test_") && v("STRIPE_PUBLISHABLE_KEY").startsWith("pk_live_")) erro("Chaves de modos diferentes (sk_test com pk_live)")
  for (const k of ["STRIPE_PRICE_SOLO_PRO", "STRIPE_PRICE_CLINICA", "STRIPE_PRICE_CLINICA_PRO"]) exige(/^price_/.test(v(k)), `${k} ok`, `${k} ausente (crie o preço recorrente e cole o price_…)`, aviso)
}

// ── Google ───────────────────────────────────────────────────────────────
if (!v("GOOGLE_CLIENT_ID")) aviso("Google não configurado (login Google e Agenda desligados; o magic link continua)")
else {
  exige(/\.apps\.googleusercontent\.com$/.test(v("GOOGLE_CLIENT_ID")), "GOOGLE_CLIENT_ID ok", "GOOGLE_CLIENT_ID fora do formato …apps.googleusercontent.com")
  exige(v("GOOGLE_CLIENT_SECRET").length > 10, "GOOGLE_CLIENT_SECRET presente", "GOOGLE_CLIENT_SECRET ausente")
  const api = v("API_PUBLIC_URL").replace(/\/+$/, "")
  aviso(`Cadastre no Google Console: ${api}/api/v1/auth/google/callback e ${api}/api/v1/integrations/google-calendar/callback`)
}

// ── Cloudflare / backup ──────────────────────────────────────────────────
exige(v("CLOUDFLARE_TUNNEL_TOKEN").length > 40, "CLOUDFLARE_TUNNEL_TOKEN presente", "CLOUDFLARE_TUNNEL_TOKEN ausente (sem ele o site não sai do PC)", aviso)
exige(/^age1[a-z0-9]{50,}$/.test(v("BACKUP_AGE_RECIPIENT")), "BACKUP_AGE_RECIPIENT ok (chave pública do age)", "BACKUP_AGE_RECIPIENT ausente (o backup NÃO roda sem criptografia)", aviso)
exige(!!v("BACKUP_RCLONE_REMOTE") && !!v("R2_ACCESS_KEY_ID") && !!v("R2_SECRET_ACCESS_KEY"), "Destino externo do backup configurado", "Backup externo (R2) não configurado — o backup ficaria só no PC", aviso)

// ── DNS do remetente de e-mail ───────────────────────────────────────────
async function txt(nome) { try { return (await resolveTxt(nome)).map((p) => p.join("")) } catch { return [] } }
if (dominio && !/resend\.dev$/.test(dominio)) {
  const spf = (await txt(dominio)).find((t) => t.startsWith("v=spf1"))
  exige(!!spf, `SPF presente em ${dominio}`, `Sem registro SPF (TXT v=spf1…) em ${dominio}`)
  if (spf && !/amazonses|resend/.test(spf)) aviso("SPF existe mas não parece incluir o Resend/Amazon SES — confira o registro que o painel do Resend pede")
  const dmarc = (await txt(`_dmarc.${dominio}`)).find((t) => t.startsWith("v=DMARC1"))
  exige(!!dmarc, `DMARC presente (${(dmarc ?? "").slice(0, 40)}…)`, `Sem DMARC em _dmarc.${dominio} (comece com v=DMARC1; p=none; rua=mailto:você@${dominio})`, aviso)
  const dkim = (await txt(`resend._domainkey.${dominio}`)).length > 0 || (await resolveCname(`resend._domainkey.${dominio}`).catch(() => [])).length > 0
  exige(dkim, "DKIM (resend._domainkey) presente", `Sem DKIM em resend._domainkey.${dominio} (copie do painel do Resend)`)
}

// ── Consultas somente-leitura (opcional) ─────────────────────────────────
if (o.online) {
  if (sk) {
    const r = await fetch("https://api.stripe.com/v1/account", { headers: { authorization: `Bearer ${sk}` } }).catch(() => null)
    if (!r) aviso("Stripe: sem resposta (rede)")
    else if (!r.ok) erro(`Stripe recusou a chave (HTTP ${r.status})`)
    else {
      const a = await r.json()
      ok(`Stripe: conta ${a.id}, país ${a.country}, cobranças ${a.charges_enabled ? "habilitadas" : "NÃO habilitadas"}, modo ${sk.startsWith("sk_test_") ? "teste" : "live"}`)
      if (a.country && a.country !== "BR") aviso(`Conta Stripe de ${a.country}: para cobrar em BRL de profissionais brasileiros confirme o suporte ao Connect no Brasil`)
    }
  }
  if (v("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${v("RESEND_API_KEY")}` } }).catch(() => null)
    if (!r) aviso("Resend: sem resposta (rede)")
    else if (!r.ok) erro(`Resend recusou a chave (HTTP ${r.status})`)
    else {
      const d = (await r.json()).data ?? []
      const meu = d.find((x) => x.name === dominio)
      if (!meu) erro(`O domínio ${dominio} não está cadastrado nesta conta do Resend`)
      else exige(meu.status === "verified", `Resend: domínio ${dominio} verificado`, `Resend: domínio ${dominio} está "${meu.status}" (conclua o DNS no painel)`)
    }
  }
}

const icone = { ok: "✔", aviso: "⚠", erro: "✘" }
for (const i of itens) console.log(`${icone[i.nivel]} ${i.msg}`)
const e = itens.filter((i) => i.nivel === "erro").length
const a = itens.filter((i) => i.nivel === "aviso").length
console.log(`\n${e} bloqueio(s), ${a} aviso(s). ${e ? "Corrija os ✘ antes de subir/provar." : "Pode seguir para as provas (docs/v3-provas.md)."}`)
process.exit(e ? 1 : 0)
