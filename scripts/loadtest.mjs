#!/usr/bin/env node
/**
 * Teste de carga do MarcaAí (sem dependências: só Node 18+). Roda contra uma API no ar e mede latência/erros em dois cenários:
 *   A) leitura pública (perfil + horários livres) — o que o paciente mais faz;
 *   B) tempestade de agendamentos — N pacientes em N horários diferentes ao mesmo tempo (todos devem passar) e M pacientes
 *      disputando o MESMO horário (só 1 pode passar: anti double-booking sob carga).
 *
 * Pré-requisitos: API com `Payments:Provider=Fake` fora de produção (só para o seed) e rate limit ampliado
 * (`RateLimit__Multiplier=1000`), senão o limitador responde 429 de propósito. Veja docs/load-test.md.
 *
 *   node scripts/loadtest.mjs --api http://127.0.0.1:8180 --pg marcaai-postgres-1 --duration 20 --concurrency 50
 */
import { execFileSync } from "node:child_process"
import { parseArgs } from "node:util"

const { values: o } = parseArgs({
  options: {
    api: { type: "string", default: "http://127.0.0.1:8180" },
    pg: { type: "string", default: "marcaai-postgres-1" }, // container do Postgres (para ler o token do magic link)
    "pg-user": { type: "string", default: "marcaai" },
    "pg-db": { type: "string", default: "marcaai" },
    duration: { type: "string", default: "20" },
    concurrency: { type: "string", default: "50" },
    storm: { type: "string", default: "30" },
    "p95-ms": { type: "string", default: "500" },
    json: { type: "string" },
  },
})
const API = o.api.replace(/\/+$/, "")
const DURATION = Number(o.duration) * 1000
const CONC = Number(o.concurrency)
const STORM = Number(o.storm)
const P95_LIMIT = Number(o["p95-ms"])
const RUN = Date.now().toString(36)

const j = (r) => r.json().catch(() => ({}))
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0)

async function login(email) {
  const r = await fetch(`${API}/api/v1/auth/magic-link/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })
  if (!r.ok) throw new Error(`magic-link/request: ${r.status}`)
  const token = execFileSync("docker", ["exec", o.pg, "psql", "-U", o["pg-user"], "-d", o["pg-db"], "-At", "-c",
    `select token from verification_tokens where identifier='${email.toLowerCase()}' order by expires desc limit 1`]).toString().trim()
  const v = await fetch(`${API}/api/v1/auth/magic-link/verify?token=${token}`, { redirect: "manual" })
  if (!v.ok) throw new Error(`verify: ${v.status}`)
  const cookies = v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
  return cookies
}

async function seed() {
  const email = `load-${RUN}@example.test`
  const username = `load-${RUN}`
  const cookie = await login(email)
  const h = { "content-type": "application/json", cookie }
  let r = await fetch(`${API}/api/v1/me/profile`, { method: "PUT", headers: h, body: JSON.stringify({ name: "Dra. Carga", username, timeZone: "America/Sao_Paulo", bio: null, theme: "LIGHT", brandColor: null, specialty: null, council: null, registrationNumber: null, clinicName: null }) })
  if (!r.ok) throw new Error(`profile: ${r.status} ${await r.text()}`)
  r = await fetch(`${API}/api/v1/event-types`, { method: "POST", headers: h, body: JSON.stringify({ title: "Consulta", slug: "consulta", duration: 30, locationType: "IN_PERSON", requiresConfirm: false, beforeEventBuffer: 0, afterEventBuffer: 0, bookingLimitDays: 90, locationValue: "Rua X", price: null, questions: [] }) })
  if (!r.ok) throw new Error(`event-type: ${r.status} ${await r.text()}`)
  const pub = await j(await fetch(`${API}/api/v1/public/${username}`))
  return { username, ownerId: pub.id, eventTypeId: pub.eventTypes[0].id }
}

function proximoDiaUtil(offset) {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset)
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function slotsDo(s, dia) {
  const r = await fetch(`${API}/api/v1/slots?ownerId=${s.ownerId}&eventTypeId=${s.eventTypeId}&date=${dia}&tz=America%2FSao_Paulo`)
  return { status: r.status, slots: (await j(r)).slots ?? [] }
}

/** Cenário A: N workers martelando leitura pública durante a janela. */
async function leitura(s) {
  const lat = []; const cod = new Map(); let fim = Date.now() + DURATION; const dia = proximoDiaUtil(3)
  const alvos = [
    () => `${API}/api/v1/public/${s.username}`,
    () => `${API}/api/v1/slots?ownerId=${s.ownerId}&eventTypeId=${s.eventTypeId}&date=${dia}&tz=America%2FSao_Paulo`,
    () => `${API}/api/v1/slots/month?ownerId=${s.ownerId}&eventTypeId=${s.eventTypeId}&month=${dia.slice(0, 7)}&tz=America%2FSao_Paulo`, // calendário do mês (I2: cache + carga única)
    () => `${API}/health`,
  ]
  const t0 = Date.now()
  await Promise.all(Array.from({ length: CONC }, async (_, w) => {
    let i = w
    while (Date.now() < fim) {
      const t = performance.now()
      try {
        const r = await fetch(alvos[i++ % alvos.length]()); await r.arrayBuffer()
        lat.push(performance.now() - t); cod.set(r.status, (cod.get(r.status) ?? 0) + 1)
      } catch { cod.set("erro-rede", (cod.get("erro-rede") ?? 0) + 1) }
    }
  }))
  lat.sort((a, b) => a - b)
  const seg = (Date.now() - t0) / 1000
  return { reqs: lat.length, rps: +(lat.length / seg).toFixed(1), p50: +pct(lat, 50).toFixed(1), p95: +pct(lat, 95).toFixed(1), p99: +pct(lat, 99).toFixed(1), max: +(lat.at(-1) ?? 0).toFixed(1), codigos: Object.fromEntries(cod) }
}

const corpo = (s, slot, email) => ({ ownerId: s.ownerId, eventTypeId: s.eventTypeId, guestName: "Paciente Carga", guestEmail: email, startTimeUtc: slot.startUtc, endTimeUtc: slot.endUtc, guestTimeZone: "America/Sao_Paulo", consentAccepted: true, responses: [] })
const post = async (s, slot, email) => {
  const t = performance.now()
  const r = await fetch(`${API}/api/v1/bookings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo(s, slot, email)) })
  await r.arrayBuffer()
  return { status: r.status, ms: performance.now() - t }
}

/** Cenário B: tempestade de agendamentos. */
async function tempestade(s) {
  const dia = proximoDiaUtil(5)
  const { slots } = await slotsDo(s, dia)
  const distintos = slots.slice(0, Math.min(STORM, slots.length))
  const t0 = performance.now()
  const a = await Promise.all(distintos.map((sl, i) => post(s, sl, `storm-${RUN}-${i}@example.test`)))
  const ms = performance.now() - t0

  const dia2 = proximoDiaUtil(8)
  const { slots: s2 } = await slotsDo(s, dia2)
  const alvo = s2[0]
  const b = await Promise.all(Array.from({ length: STORM }, (_, i) => post(s, alvo, `race-${RUN}-${i}@example.test`)))

  const lat = a.map((x) => x.ms).sort((x, y) => x - y)
  return {
    horarios_distintos: { disparos: a.length, criados_201: a.filter((x) => x.status === 201).length, p95: +pct(lat, 95).toFixed(1), total_ms: +ms.toFixed(0), erros_5xx: a.filter((x) => x.status >= 500).length, outros: a.filter((x) => ![201].includes(x.status)).map((x) => x.status) },
    mesmo_horario: { disparos: b.length, criados_201: b.filter((x) => x.status === 201).length, recusados: b.filter((x) => [409, 422].includes(x.status)).length, erros_5xx: b.filter((x) => x.status >= 500).length, outros: b.filter((x) => ![201, 409, 422].includes(x.status)).map((x) => x.status) },
  }
}

const main = async () => {
  console.log(`API ${API} · ${CONC} conexões · ${o.duration}s · tempestade de ${STORM}\n`)
  const s = await seed()
  console.log(`seed ok (profissional ${s.username})\n`)

  console.log("A) leitura pública…")
  const A = await leitura(s)
  console.table([A])

  console.log("B) tempestade de agendamentos…")
  const B = await tempestade(s)
  console.table(B)

  const falhas = []
  if (A.p95 > P95_LIMIT) falhas.push(`p95 da leitura ${A.p95} ms > ${P95_LIMIT} ms`)
  const e5 = Object.entries(A.codigos).filter(([c]) => String(c).startsWith("5") || c === "erro-rede").reduce((n, [, v]) => n + v, 0)
  if (e5 > 0) falhas.push(`${e5} erro(s) 5xx/rede na leitura`)
  if (A.codigos[429]) falhas.push(`${A.codigos[429]} resposta(s) 429 (suba RateLimit__Multiplier para o teste)`)
  if (B.horarios_distintos.criados_201 !== B.horarios_distintos.disparos) falhas.push("nem todos os horários distintos foram criados")
  if (B.mesmo_horario.criados_201 !== 1) falhas.push(`double-booking: ${B.mesmo_horario.criados_201} agendamentos no mesmo horário (esperado 1)`)
  if (B.horarios_distintos.erros_5xx || B.mesmo_horario.erros_5xx) falhas.push("erros 5xx na tempestade")

  if (o.json) (await import("node:fs")).writeFileSync(o.json, JSON.stringify({ quando: new Date().toISOString(), api: API, conexoes: CONC, leitura: A, tempestade: B, falhas }, null, 2))
  console.log(falhas.length ? `\nFALHOU:\n - ${falhas.join("\n - ")}` : "\nOK: sem erro 5xx, p95 dentro do limite e sem double-booking.")
  process.exit(falhas.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
