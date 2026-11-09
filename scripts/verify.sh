#!/usr/bin/env bash
# =============================================================================
# MarcaAí — verificação ÚNICA (o "CI local", já que o GitHub Actions está desligado).
#
#   scripts/verify.sh             tudo: segredos, build+testes do backend (unit+integração), migrations, auditoria de
#                                 dependências, front (tsc, lint sem avisos, unit, build) e E2E contra o build de produção
#   scripts/verify.sh --fast      sem o E2E (é o que o hook de pre-push roda)
#   scripts/verify.sh --no-docker sem o que precisa do Docker (testes de integração e E2E); NÃO substitui a verificação completa
#
# Roda todos os passos (não para no primeiro erro), imprime um resumo e sai com 1 se algum FALHOU. AVISO não falha.
# Logs de cada passo: .verify/NN-nome.log (ignorado pelo git).
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAST=0; NO_DOCKER=0
for a in "$@"; do
  case "$a" in
    --fast) FAST=1 ;;
    --no-docker) NO_DOCKER=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opção desconhecida: $a (use --fast, --no-docker)"; exit 2 ;;
  esac
done

LOGS="$ROOT/.verify"; rm -rf "$LOGS"; mkdir -p "$LOGS"
declare -a NAMES STATUS TIMES
N=0
START=$(date +%s)

# step "nome" cmd...   → roda, guarda status (OK/FALHOU) e tempo; mostra o fim do log se falhar.
step() {
  local name="$1"; shift
  N=$((N + 1)); local log; log="$LOGS/$(printf '%02d' $N)-$(echo "$name" | tr -c 'A-Za-z0-9\n' '-' | tr -s '-').log"
  printf '▶ %s ... ' "$name"
  local t0; t0=$(date +%s)
  if "$@" >"$log" 2>&1; then STATUS[$N]="OK"; echo "ok"; else STATUS[$N]="FALHOU"; echo "FALHOU"; tail -n 25 "$log" | sed 's/^/    | /'; fi
  NAMES[$N]="$name"; TIMES[$N]=$(( $(date +%s) - t0 ))
}
skip() { N=$((N + 1)); NAMES[$N]="$1"; STATUS[$N]="PULADO"; TIMES[$N]=0; echo "▷ $1 ... pulado ($2)"; }
warn() { N=$((N + 1)); NAMES[$N]="$1"; STATUS[$N]="AVISO"; TIMES[$N]=0; echo "⚠ $1 ... $2"; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

ensure_docker() {
  docker info >/dev/null 2>&1 && return 0
  echo "Docker não está rodando; tentando abrir o Docker Desktop (até 3 min)..."
  local exe="${LOCALAPPDATA:-}/Programs/DockerDesktop/Docker Desktop.exe"
  [ -f "$exe" ] && (powershell.exe -NoProfile -Command "Start-Process '$(cygpath -w "$exe" 2>/dev/null || echo "$exe")'" >/dev/null 2>&1 || true)
  for _ in $(seq 1 36); do docker info >/dev/null 2>&1 && return 0; sleep 5; done
  return 1
}

# ── Passos ───────────────────────────────────────────────────────────────────
audit_dotnet() {
  # `dotnet list package --vulnerable` sempre sai com 0: lê a saída. Falha com severidade High/Critical.
  local out; out="$(cd "$ROOT/backend" && dotnet list package --vulnerable --include-transitive 2>&1)"
  echo "$out" | tail -n 40
  if echo "$out" | grep -qiE "(sem acesso|could not|unable to load the service index|NU1900)"; then return 3; fi
  if echo "$out" | grep -E "^\s*>" | grep -qiE "High|Critical|Alta|Crítica"; then return 1; fi
  return 0
}
audit_npm() {
  local out rc; out="$(cd "$ROOT/frontend" && npm audit --audit-level=high 2>&1)"; rc=$?
  echo "$out" | tail -n 40
  if echo "$out" | grep -qE "ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED"; then return 3; fi
  return $rc
}
# Roda um passo cujo código 3 significa "sem rede": vira AVISO em vez de falha.
step_net() {
  local name="$1"; shift
  N=$((N + 1)); local log; log="$LOGS/$(printf '%02d' $N)-$(echo "$name" | tr -c 'A-Za-z0-9\n' '-' | tr -s '-').log"
  printf '▶ %s ... ' "$name"; local t0; t0=$(date +%s)
  "$@" >"$log" 2>&1; local rc=$?
  case $rc in
    0) STATUS[$N]="OK"; echo "ok" ;;
    3) STATUS[$N]="AVISO"; echo "sem rede (não verificado)" ;;
    *) STATUS[$N]="FALHOU"; echo "FALHOU"; tail -n 25 "$log" | sed 's/^/    | /' ;;
  esac
  NAMES[$N]="$name"; TIMES[$N]=$(( $(date +%s) - t0 ))
}

echo "MarcaAí verify — modo: $([ $FAST = 1 ] && echo rápido || echo completo)$([ $NO_DOCKER = 1 ] && echo ', sem Docker')"

step "Segredos e dumps (scan-secrets)" bash scripts/scan-secrets.sh --all
step "Segredos: testes do scanner" bash scripts/tests/test-scan-secrets.sh

DOCKER_OK=1
if [ $NO_DOCKER = 0 ]; then ensure_docker || { DOCKER_OK=0; warn "Docker" "indisponível: integração e E2E serão marcados como FALHOU"; }; fi

# Backend
step "Backend: restore + build (Release)" bash -c 'cd backend && dotnet restore && dotnet build --no-restore -c Release'
step "Backend: testes unitários" bash -c 'cd backend && dotnet test --no-build -c Release --filter "FullyQualifiedName!~IntegrationTests"'
if [ $NO_DOCKER = 1 ]; then skip "Backend: testes de integração" "--no-docker"
elif [ $DOCKER_OK = 0 ]; then N=$((N+1)); NAMES[$N]="Backend: testes de integração"; STATUS[$N]="FALHOU"; TIMES[$N]=0
else step "Backend: testes de integração (Testcontainers)" bash -c 'cd backend && dotnet test --no-build -c Release --filter "FullyQualifiedName~IntegrationTests"'; fi
if dotnet ef --version >/dev/null 2>&1; then
  step "Migrations: modelo sem mudanças pendentes" bash -c 'cd backend && dotnet ef migrations has-pending-model-changes --no-build --configuration Release -p src/MarcaAi.Infrastructure -s src/MarcaAi.Api'
else warn "Migrations: modelo sem mudanças pendentes" "dotnet-ef ausente (o teste de integração I1FoundationTests cobre o mesmo)"; fi
step_net "Auditoria: pacotes .NET vulneráveis" audit_dotnet

# Frontend
[ -d frontend/node_modules ] || step "Frontend: npm ci" bash -c 'cd frontend && npm ci'
step "Frontend: tsc" bash -c 'cd frontend && npx tsc --noEmit'
step "Frontend: lint (zero avisos)" bash -c 'cd frontend && npx eslint . --max-warnings 0'
step "Frontend: testes unitários" bash -c 'cd frontend && npm test'
step "Frontend: build de produção" bash -c 'cd frontend && npm run build'
step_net "Auditoria: pacotes npm (alto/crítico)" audit_npm

# E2E (build de produção do Next + API em Development com pagamento simulado)
if [ $FAST = 1 ]; then skip "E2E (Playwright)" "--fast"
elif [ $NO_DOCKER = 1 ]; then skip "E2E (Playwright)" "--no-docker"
elif [ $DOCKER_OK = 0 ]; then N=$((N+1)); NAMES[$N]="E2E (Playwright)"; STATUS[$N]="FALHOU"; TIMES[$N]=0
elif port_busy 5080 || port_busy 3000; then
  N=$((N+1)); NAMES[$N]="E2E (Playwright)"; STATUS[$N]="FALHOU"; TIMES[$N]=0
  echo "✖ Portas 5080/3000 ocupadas: o Playwright reaproveitaria um servidor velho. Libere: Get-NetTCPConnection -LocalPort 5080,3000 | Stop-Process"
else
  step "Infra de dev (Postgres 5433 + Mailpit)" docker compose -f docker-compose.dev.yml up -d --wait
  step "E2E (Playwright, build de produção)" bash -c 'cd frontend && E2E_SKIP_BUILD=1 npx playwright test --reporter=line'
  # Não deixa API/Next órfãos travando DLL/portas na próxima rodada.
  for p in 5080 3000; do powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1 || true; done
fi

# ── Resumo ───────────────────────────────────────────────────────────────────
echo; echo "════════ Resumo ════════"
failed=0
for i in $(seq 1 $N); do
  case "${STATUS[$i]}" in OK) m="✔";; FALHOU) m="✖"; failed=1;; AVISO) m="⚠";; *) m="▷";; esac
  printf '%s %-52s %-7s %4ss\n' "$m" "${NAMES[$i]}" "${STATUS[$i]}" "${TIMES[$i]}"
done
echo "Tempo total: $(( $(date +%s) - START ))s · logs em .verify/"
if [ $failed = 1 ]; then echo "❌ verify FALHOU"; exit 1; fi
[ $FAST = 1 ] || [ $NO_DOCKER = 1 ] && echo "ℹ Modo reduzido: não substitui a verificação completa (scripts/verify.sh)."
echo "✅ verify OK"
exit 0
