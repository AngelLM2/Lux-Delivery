#!/usr/bin/env bash
# Rolling deploy da API num unico servidor (docs/07-escalabilidade, estagio 1). Migrations devem ser expand/contract.
#   COMPOSE="docker compose --env-file infra/single-node/.env.prod -f docker-compose.yml -f infra/single-node/docker-compose.prod.yml" \
#     ./scripts/deploy-zero-downtime.sh
set -euo pipefail

COMPOSE=${COMPOSE:-"docker compose"}
SERVICE=api

old_ids=$($COMPOSE ps -q "$SERVICE")
[ -n "$old_ids" ] || { echo "nenhum container '$SERVICE' rodando"; exit 1; }

echo "==> build da nova imagem"
$COMPOSE build migrate web

echo "==> migrations"
$COMPOSE run --rm migrate

echo "==> subindo container novo ao lado do antigo"
current=$(echo "$old_ids" | wc -l)
$COMPOSE up -d --no-deps --no-recreate --scale "$SERVICE=$((current + 1))" "$SERVICE"
new_id=$($COMPOSE ps -q "$SERVICE" | grep -v -F "$old_ids" | head -1)

echo "==> aguardando healthcheck de $new_id"
status=starting
for _ in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$new_id")
  [ "$status" = "healthy" ] && break
  sleep 2
done
if [ "$status" != "healthy" ]; then
  echo "!! container novo nao ficou saudavel ($status): rollback"
  docker logs --tail 50 "$new_id" || true
  docker rm -f "$new_id"
  exit 1
fi

echo "==> nginx passa a balancear entre antigo e novo"
$COMPOSE exec -T web nginx -s reload

echo "==> drenando e removendo o(s) container(s) antigo(s)"
for id in $old_ids; do
  docker stop -t 25 "$id" >/dev/null   # SIGTERM: uvicorn termina as requisicoes em voo (graceful 20s)
  docker rm "$id" >/dev/null
done
$COMPOSE exec -T web nginx -s reload

echo "==> worker (sem estado HTTP: reinicio simples)"
$COMPOSE up -d --no-deps worker

echo "==> deploy concluido: $($COMPOSE ps -q "$SERVICE" | wc -l) container(s) de $SERVICE"
