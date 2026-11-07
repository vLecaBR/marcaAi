#!/bin/sh
# Instala o agendamento (cron do busybox) e fica em primeiro plano.
set -eu

CRON_EXPR="${BACKUP_CRON:-30 3 * * *}"

if [ -z "${AGE_RECIPIENT:-}" ]; then
  echo "[backup] AVISO: BACKUP_AGE_RECIPIENT não definido — o backup NÃO vai rodar (nunca gravamos dump sem criptografia)."
fi
if [ -z "${RCLONE_REMOTE:-}" ]; then
  echo "[backup] AVISO: BACKUP_RCLONE_REMOTE não definido — os backups ficam só no volume local (NÃO é backup de verdade: o PC é ponto único de falha)."
fi

# O cron não herda o ambiente: exporta o necessário para um arquivo lido pelo backup.sh.
env | grep -E '^(PG|AGE_|RCLONE_|TZ|BACKUP_)' | while IFS= read -r line; do
  k="${line%%=*}"; v="${line#*=}"
  printf "export %s='%s'\n" "$k" "$(printf '%s' "$v" | sed "s/'/'\\\\''/g")"
done > /etc/backup.env

echo "${CRON_EXPR} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] agendado: '${CRON_EXPR}' (TZ=${TZ:-UTC}). Para rodar agora: docker compose exec backup backup.sh"
exec crond -f -l 8
