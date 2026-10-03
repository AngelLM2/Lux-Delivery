# Atalhos (Linux/macOS/WSL). No Windows sem make, os comandos estao no README.
COMPOSE = docker compose

.PHONY: up down logs test test-api test-web lint scale observability loadtest contract seed-big

up:            ## stack completa de desenvolvimento
	$(COMPOSE) up -d --build
down:
	$(COMPOSE) down
logs:
	$(COMPOSE) logs -f api worker
test: test-api test-web
test-api:
	$(COMPOSE) up -d db redis && cd apps/api && pytest
test-web:
	cd apps/web && npm test
lint:
	cd apps/api && ruff check . && ruff format --check .
	cd apps/web && npm run lint && npm run typecheck
scale:         ## nginx + 3 replicas da API + PgBouncer
	$(COMPOSE) -f docker-compose.yml -f docker-compose.scale.yml up -d --build
	$(COMPOSE) -f docker-compose.yml -f docker-compose.scale.yml up -d --force-recreate --no-deps web
observability: ## Prometheus + Grafana (http://localhost:3001)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.observability.yml up -d
loadtest:      ## k6, cenario de navegacao
	$(COMPOSE) -f docker-compose.yml -f docker-compose.loadtest.yml run --rm k6 run /scripts/browse.js
contract:      ## exporta o OpenAPI e regenera os tipos do front
	cd apps/api && python -m app.scripts.export_openapi ../web/openapi.json && cd ../web && npm run gen:api
seed-big:      ## 100 mil pedidos para testes de carga e EXPLAIN
	$(COMPOSE) run --rm seed python -m app.scripts.seed --reset --orders 100000 --days 120
