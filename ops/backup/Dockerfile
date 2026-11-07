# Backup diário do MarcaAí: pg_dump -Fc + chaves do Data Protection → criptografa com age → envia com rclone.
# Base postgres:18-alpine para que o pg_dump tenha a MESMA versão do servidor.
FROM postgres:18-alpine
RUN apk add --no-cache age rclone tzdata tar
COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh /usr/local/bin/restore.sh
USER root
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
