#!/bin/sh
# Restaura um backup num banco NOVO e confere contagens (restore drill: rode periodicamente).
#   docker compose exec backup sh -c "sh /restore.sh /backups/lux_delivery-<stamp>.dump"
set -eu

DUMP="${1:?uso: restore.sh <arquivo.dump> [banco_destino]}"
TARGET_DB="${2:-lux_restore_check}"

psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)" -c "CREATE DATABASE ${TARGET_DB}"
pg_restore --no-owner --exit-on-error --dbname="${TARGET_DB}" "${DUMP}"

echo "contagens no banco restaurado:"
psql -d "${TARGET_DB}" -At -c "SELECT 'users', count(*) FROM users UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'products', count(*) FROM product"
psql -d "${TARGET_DB}" -At -c "SELECT 'alembic', version_num FROM alembic_version"
