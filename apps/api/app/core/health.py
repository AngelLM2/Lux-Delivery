import logging
from pathlib import Path

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.exceptions import RedisError
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.metrics import DB_POOL_CHECKED_OUT
from app.core.redis import get_redis

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"], include_in_schema=False)

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def expected_migration_head() -> str | None:
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config(str(_ALEMBIC_INI))
        config.set_main_option("script_location", str(_ALEMBIC_INI.parent / "alembic"))
        return ScriptDirectory.from_config(config).get_current_head()
    except Exception:
        logger.exception("could_not_resolve_alembic_head")
        return None


@router.get("/health/live")
async def live() -> dict:
    """Liveness: the process is up. Never touches dependencies (a DB outage must not make
    the orchestrator restart every API container in a loop)."""
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(request: Request) -> JSONResponse:
    """Readiness: can this instance serve traffic right now? Load balancers stop routing to
    it while this returns 503."""
    checks: dict[str, str] = {}
    try:
        async with SessionLocal() as session:
            version = (await session.execute(text("SELECT version_num FROM alembic_version"))).scalar_one_or_none()
        expected = request.app.state.migration_head
        checks["database"] = "ok"
        checks["migrations"] = "ok" if expected is None or version == expected else f"pending ({version} != {expected})"
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"error: {type(exc).__name__}"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except RedisError as exc:
        checks["redis"] = f"error: {type(exc).__name__}"

    healthy = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ok" if healthy else "degraded", "checks": checks}, status_code=200 if healthy else 503
    )


@router.get("/metrics")
async def metrics(request: Request) -> Response:
    if settings.METRICS_TOKEN and request.headers.get("authorization") != f"Bearer {settings.METRICS_TOKEN}":
        return PlainTextResponse("unauthorized", status_code=401)
    DB_POOL_CHECKED_OUT.set(engine.pool.checkedout())
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
