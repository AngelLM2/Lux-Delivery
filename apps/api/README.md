# Lux Delivery — API

FastAPI modular monolith (Python 3.13, SQLAlchemy 2 async + asyncpg, PostgreSQL 17, Redis 7).
Project overview and architecture docs live at the repository root: [README](../../README.md) ·
[docs/](../../docs/README.md).

## Layout

```text
app/
├── main.py           app factory: middlewares (pure ASGI), routers, lifespan
├── core/             config · database · redis · security · errors · middleware · cache · rate_limit
│                     pagination · outbox · realtime hub · metrics · health
├── modules/          one package per bounded context: router → service → repository (+ domain.py)
│   ├── identity/     users, auth (HttpOnly cookies, rotating refresh tokens), RBAC
│   ├── catalog/      categories, products, images (Storage port: local | S3); public.py = only cross-module entry
│   ├── ordering/     orders, pure state machine (domain.py), idempotency keys
│   ├── notifications/ notifications + event consumer
│   ├── analytics/    SQL aggregations (p50/p90, daily series, top products), read-replica aware
│   └── realtime/     SSE endpoint + fan-out consumer
├── workers/          python -m app.workers: outbox relay, Redis Streams consumer groups, maintenance
└── scripts/          seed, export_openapi
alembic/              migrations (7f3a2c9d1e04 = v3 schema hardening)
tests/                unit/ (pure) and integration/ (real Postgres + Redis)
```

## Running locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # .venv/bin/ on Linux/macOS
cp .env.example .env
docker compose -f ../../docker-compose.yml up -d db redis
alembic upgrade head
python -m app.scripts.seed                            # demo data (idempotent)
uvicorn app.main:app --reload                         # http://localhost:8000/docs
python -m app.workers                                 # in another terminal: events, notifications, realtime
```

## Tests and quality

```bash
pytest                          # 145 tests against a throwaway lux_delivery_test database (~20 s)
pytest --cov=app                # ~91% (coverage traces greenlets: see pyproject.toml)
ruff check . && ruff format --check .
```

The suite recreates its own database (it refuses names that do not end in `_test`), applies the real
migrations, and runs `alembic check` so model/schema drift fails the build.

## Configuration

All settings live in `app/core/config.py` (pydantic-settings, `.env` supported) and have development
defaults. With `ENV=production` the app refuses to boot with the default `SECRET_KEY`, short secrets
or `CORS_ORIGINS=*`. See `.env.example` for the full list.

## API contract

```bash
python -m app.scripts.export_openapi ../web/openapi.json   # then: cd ../web && npm run gen:api
```

CI fails if `openapi.json` or the generated TypeScript types are out of date.
