#!/usr/bin/env bash
# Importa o dump do Supabase no banco de DEV (Postgres do docker-compose.dev.yml).
# O dump contém DADOS PESSOAIS: fica FORA do repositório e só é montado (somente leitura).
# Uso:  BACKUP_PATH=/c/Code/marcaAi-backup/marcaai-supabase.dump ./scripts/import-supabase-backup.sh
# Pare a API antes. DESTRUTIVO: recria o banco "marcaai" de dev.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_W="$(cd "$ROOT" && { pwd -W 2>/dev/null || pwd; })"
BACKUP_PATH="${BACKUP_PATH:-C:\Code\marcaAi-backup\marcaai-supabase.dump}"
DB="${POSTGRES_DB:-marcaai}"; USER_="${POSTGRES_USER:-marcaai}"
COMPOSE=(docker compose -f "$ROOT_W/docker-compose.dev.yml")
PSQL=("${COMPOSE[@]}" exec -T postgres psql -U "$USER_" -v ON_ERROR_STOP=1)

[[ -f "$BACKUP_PATH" ]] || { echo "Backup não encontrado: $BACKUP_PATH" >&2; exit 1; }
BDIR_W="$(cd "$(dirname "$BACKUP_PATH")" && { pwd -W 2>/dev/null || pwd; })"
case "$BDIR_W/" in "$ROOT_W/"*) echo "O dump não pode ficar dentro do repositório." >&2; exit 1;; esac
if curl -s -o /dev/null http://localhost:5080/health; then echo "Pare a API antes de importar." >&2; exit 1; fi

"${COMPOSE[@]}" up -d postgres --wait
echo "▶ Recriando banco '$DB' (vazio)"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB OWNER $USER_"

echo "▶ pg_restore (schema + dados)"
BDIR="$BDIR_W"; BFILE="$(basename "$BACKUP_PATH")"
LOG="$(mktemp)"
# set +e: erros "already exists" são esperados; filtramos abaixo.
set +e
MSYS_NO_PATHCONV=1 "${COMPOSE[@]}" run --rm --no-deps -e PGPASSWORD="${POSTGRES_PASSWORD:-marcaai}" -v "$BDIR:/backup:ro" --entrypoint pg_restore postgres \
  -h postgres -U "$USER_" -d "$DB" --no-owner --no-privileges "/backup/$BFILE" 2>"$LOG"
set -e
UNEXPECTED="$(grep -E 'pg_restore: error' "$LOG" | grep -viE 'already exists' || true)"
NTAB="$("${PSQL[@]}" -d "$DB" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
if [[ -n "$UNEXPECTED" || "$NTAB" -eq 0 ]]; then echo "ERROS INESPERADOS no pg_restore:"; echo "$UNEXPECTED"; [[ "$NTAB" -eq 0 ]] && { echo "Nenhuma tabela restaurada. Saída:"; cat "$LOG"; }; echo "(log: $LOG)"; exit 1; fi
rm -f "$LOG"

echo "▶ Normalizando códigos de plano"
"${PSQL[@]}" -d "$DB" < "$ROOT/backend/scripts/normalize_plan_codes.sql"

echo "▶ Contagem de linhas por tabela"
"${PSQL[@]}" -d "$DB" -c "
SELECT relname AS tabela, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text::int AS linhas
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY 1;"
echo "✔ Importação concluída. Suba a API: o Migrate() aplica o que faltar e cria o schema do Hangfire."
