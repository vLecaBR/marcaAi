#!/usr/bin/env bash
# =============================================================================
# MarcaAí — varredura de segredos e dumps.
# Uso:  scripts/scan-secrets.sh --staged   (só o que está no índice; usado pelo pre-commit)
#       scripts/scan-secrets.sh --all      (todos os arquivos versionados + novos não ignorados; usado pelo verify)
# Falha (exit 1) se achar: chave com formato real (Stripe live/test longa, whsec_, AGE-SECRET-KEY, Resend, Google, AWS,
# chave privada PEM, token do Cloudflare Tunnel), arquivo .env (exceto *.example), dump/backup/chave, ou blob > 5 MB.
# Exceção pontual: a marca  secret-scan:allow  na mesma linha. Padrões exigem o CORPO da chave, então menções
# em documentação ("whsec_...", "sk_test_xxx") não disparam.
# =============================================================================
set -uo pipefail
MODE="${1:---all}"
cd "$(git rev-parse --show-toplevel)"

# Padrões de conteúdo (ERE). Montados de pedaços para o próprio arquivo não casar com eles.
PATTERNS=(
  'sk_live_[A-Za-z0-9]{16,}'
  'rk_live_[A-Za-z0-9]{16,}'
  'sk_test_[A-Za-z0-9]{24,}'
  'whsec_[A-Za-z0-9+/=]{24,}'
  'AGE-SECRET-KEY-1[A-Z0-9]{40,}'
  '\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}\b'
  'GOCSPX-[A-Za-z0-9_-]{20,}'
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'eyJ[A-Za-z0-9_-]{80,}'
)
REGEX="$(IFS='|'; echo "${PATTERNS[*]}")"

# Nomes de arquivo proibidos.
BAD_NAME='(^|/)\.env(\.[A-Za-z0-9_-]+)?$|\.(dump|pgdump|backup|bak|pem|pfx|p12|age)$|\.sql\.(gz|zip|7z)$'
ALLOW_NAME='\.(example|sample|template)$'
MAX_BYTES=$((5 * 1024 * 1024))

# Caminho rápido do --all: nomes, tamanhos e conteúdo em poucas chamadas (o laço por arquivo leva > 1 min no Windows).
if [ "$MODE" != "--staged" ]; then
  fail=0
  all="$( { git ls-files; git ls-files --others --exclude-standard; } | sort -u )"
  bad="$(echo "$all" | grep -E "$BAD_NAME" | grep -Ev "$ALLOW_NAME")"
  if [ -n "$bad" ]; then echo "$bad" | sed 's/^/  ✖ /; s/$/ — arquivo de segredo\/dump não pode ir ao git/'; fail=1; fi
  big="$(echo "$all" | xargs -d '
' -r find -maxdepth 0 -type f -size +5M 2>/dev/null)"
  if [ -n "$big" ]; then echo "$big" | sed 's/^/  ✖ /; s/$/ — > 5 MB: parece dump\/binário/'; fail=1; fi
  # Só arquivo:linha (nunca o conteúdo); package-lock e binários ficam de fora.
  hits="$(git grep -InE --untracked -e "$REGEX" -- . ':!*package-lock.json' 2>/dev/null | grep -v 'secret-scan:allow' | cut -d: -f1,2)"
  if [ -n "$hits" ]; then echo "$hits" | sed 's/^/  ✖ possível segredo em /'; fail=1; fi
  if [ "$fail" -ne 0 ]; then
    echo "Varredura de segredos FALHOU. Remova o segredo (e ROTACIONE-O se já saiu do seu PC). Falso positivo? Marque a linha com 'secret-scan:allow'."
    exit 1
  fi
  echo "Varredura de segredos: nada suspeito ($MODE)."; exit 0
fi

fail=0
report() { echo "  ✖ $1"; fail=1; }

if [ "$MODE" = "--staged" ]; then
  files="$(git diff --cached --name-only --diff-filter=ACMR)"
  read_added() { git diff --cached -U0 --diff-filter=ACMR -- "$1" | grep -E '^\+[^+]' | sed 's/^+//'; }
  blob_size() { git cat-file -s ":$1" 2>/dev/null || echo 0; }
else
  files="$( { git ls-files; git ls-files --others --exclude-standard; } | sort -u )"
  read_added() { [ -f "$1" ] && cat "$1"; }
  blob_size() { [ -f "$1" ] && wc -c < "$1" || echo 0; }
fi

while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -Eq "$BAD_NAME" && ! echo "$f" | grep -Eq "$ALLOW_NAME"; then
    report "$f — arquivo de segredo/dump não pode ir ao git"; continue
  fi
  size="$(blob_size "$f")"
  if [ "${size:-0}" -gt "$MAX_BYTES" ]; then
    report "$f — ${size} bytes (> 5 MB): parece dump/binário; use .gitignore ou armazene fora do repositório"; continue
  fi
  case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff|*.woff2|*.pdf|package-lock.json) continue ;; esac
  hits="$(read_added "$f" | grep -En "$REGEX" | grep -v 'secret-scan:allow' | head -3)"
  if [ -n "$hits" ]; then
    # Mostra só o número da linha: nunca reimprime (nem em parte) a credencial.
    report "$f — possível segredo na(s) linha(s) $(echo "$hits" | cut -d: -f1 | paste -sd, -) (no diff, se --staged)"
  fi
done <<< "$files"

if [ "$fail" -ne 0 ]; then
  echo "Varredura de segredos FALHOU. Remova o segredo (e ROTACIONE-O se já saiu do seu PC). Falso positivo? Marque a linha com 'secret-scan:allow'."
  exit 1
fi
echo "Varredura de segredos: nada suspeito ($MODE)."
