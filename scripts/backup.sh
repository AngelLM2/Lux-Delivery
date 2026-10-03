#!/bin/sh
# Backup logico do Postgres (pg_dump custom), usado pelo servico "backup" de infra/single-node/docker-compose.prod.yml.
# Copie /backups para fora do servidor (ex.: rclone copy /backups remote:lux-backups): backup no mesmo disco nao e backup.
set -eu

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="/backups/lux_delivery-${STAMP}.dump"

pg_dump --format=custom --compress=6 --no-owner --file="${TARGET}.partial"
mv "${TARGET}.partial" "${TARGET}"   # nunca deixa um arquivo pela metade com nome final
echo "backup ok: ${TARGET} ($(du -h "${TARGET}" | cut -f1))"

find /backups -name 'lux_delivery-*.dump' -mtime +"${BACKUP_RETENTION_DAYS:-7}" -print -delete
