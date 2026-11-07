#!/bin/sh
# Restaura um .dump.age num banco (TARGET). Montado/chamado por scripts/restore-backup.ps1:
#   /in/backup.dump.age  (backup criptografado)   /in/key.txt  (chave privada do age)
set -eu
: "${TARGET:?TARGET ausente}"

age -d -i /in/key.txt -o /tmp/restore.dump /in/backup.dump.age
dropdb --if-exists "$TARGET"
createdb "$TARGET"
pg_restore --no-owner --no-privileges -d "$TARGET" /tmp/restore.dump
rm -f /tmp/restore.dump

echo "--- conferência ---"
psql -d "$TARGET" -At -c "select 'migrations aplicadas = ' || count(*) from __ef_migrations_history"
psql -d "$TARGET" -At -c "select 'tabelas = ' || count(*) from information_schema.tables where table_schema = 'public'"
psql -d "$TARGET" -At -c "select relname || ' = ' || n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by relname limit 40"
echo "RESTAURADO em $TARGET"
