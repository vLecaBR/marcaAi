#!/bin/sh
# Gera um backup completo, criptografado, e aplica a retenção (7 diários + 4 semanais + 6 mensais).
#   - marcaai-<data>.dump.age  : pg_dump -Fc do banco, criptografado com age
#   - marcaai-<data>.keys.tar.age : chaves do Data Protection (cifram tokens de vendedores/Google)
# Rodar manualmente: docker compose exec backup backup.sh
set -eu
[ -f /etc/backup.env ] && . /etc/backup.env

if [ -z "${AGE_RECIPIENT:-}" ]; then
  echo "[backup] ABORTADO: AGE_RECIPIENT ausente (não gravamos backup sem criptografia)."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DAY_OF_WEEK="$(date +%u)"   # 7 = domingo
DAY_OF_MONTH="$(date +%d)"
ROOT=/backups
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[backup] $(date -Iseconds) iniciando ${STAMP}"

# 1) Banco (formato custom: restaura com pg_restore, inclusive parcial).
pg_dump -Fc --no-owner --no-privileges | age -r "$AGE_RECIPIENT" -o "$WORK/marcaai-${STAMP}.dump.age"

# 2) Chaves do Data Protection (sem elas, tokens cifrados de vendedores/Google ficam ilegíveis após restaurar).
if [ -d /keys ] && [ -n "$(ls -A /keys 2>/dev/null)" ]; then
  tar -C /keys -cf - . | age -r "$AGE_RECIPIENT" -o "$WORK/marcaai-${STAMP}.keys.tar.age"
fi

# 3) Verificação rápida: o arquivo existe e não está vazio.
for f in "$WORK"/*.age; do
  [ -s "$f" ] || { echo "[backup] ERRO: $f vazio"; exit 1; }
done

# 4) Local: diário sempre; semanal aos domingos; mensal no dia 01.
put_local() { mkdir -p "$ROOT/$1"; cp "$WORK"/*.age "$ROOT/$1/"; }
put_local daily
[ "$DAY_OF_WEEK" = "7" ] && put_local weekly
[ "$DAY_OF_MONTH" = "01" ] && put_local monthly

# 5) Retenção local (conta por conjunto de .dump.age; remove o par .keys correspondente).
prune_local() {
  dir="$ROOT/$1"; keep="$2"
  [ -d "$dir" ] || return 0
  ls -1 "$dir"/marcaai-*.dump.age 2>/dev/null | sort | head -n "-$keep" | while read -r old; do
    base="${old%.dump.age}"
    rm -f "$old" "${base}.keys.tar.age"
    echo "[backup] removido (local): $old"
  done
}
prune_local daily 7; prune_local weekly 4; prune_local monthly 6

# 6) Externo (rclone).
if [ -n "${RCLONE_REMOTE:-}" ]; then
  put_remote() { rclone copy "$WORK" "${RCLONE_REMOTE}/$1" --include "*.age"; }
  put_remote daily
  [ "$DAY_OF_WEEK" = "7" ] && put_remote weekly
  [ "$DAY_OF_MONTH" = "01" ] && put_remote monthly

  prune_remote() {
    path="${RCLONE_REMOTE}/$1"; keep="$2"
    rclone lsf "$path" --include "marcaai-*.dump.age" 2>/dev/null | sort | head -n "-$keep" | while read -r old; do
      base="${old%.dump.age}"
      rclone deletefile "$path/$old" || true
      rclone deletefile "$path/${base}.keys.tar.age" 2>/dev/null || true
      echo "[backup] removido (remoto): $path/$old"
    done
  }
  prune_remote daily 7; prune_remote weekly 4; prune_remote monthly 6
  echo "[backup] enviado para ${RCLONE_REMOTE}"
else
  echo "[backup] AVISO: sem destino externo (BACKUP_RCLONE_REMOTE). Backup só local."
fi

echo "[backup] $(date -Iseconds) concluído: $(du -h "$WORK/marcaai-${STAMP}.dump.age" | cut -f1) (dump)"
