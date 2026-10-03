import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

import app.models
from app.core import health
from app.core.config import settings
from app.core.database import engine, read_engine
from app.core.errors import install_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import (
    LoadShedMiddleware,
    ObservabilityMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.realtime import hub
from app.core.redis import close_redis
from app.modules.analytics.router import router as analytics_router
from app.modules.catalog.router import categories_router, products_router
from app.modules.identity.router import auth_router, users_router
from app.modules.notifications.router import router as notifications_router
from app.modules.ordering.router import router as orders_router
from app.modules.realtime.router import router as realtime_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.migration_head = health.expected_migration_head()
    logger.info("startup", extra={"env": settings.ENV, "version": settings.APP_VERSION})
    yield
    await hub.close()
    await close_redis()
    await engine.dispose()
    if read_engine is not engine:
        await read_engine.dispose()
    logger.info("shutdown")


def create_app() -> FastAPI:
    configure_logging(settings.LOG_LEVEL, settings.LOG_JSON)
    docs_enabled = not settings.is_production
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="API de delivery: catalogo, pedidos com rastreio em tempo real, notificacoes e analytics.",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    # Starlette runs middlewares in reverse order of registration: the last added is outermost.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Idempotency-Key", "X-Request-ID", "X-Bootstrap-Token"],
        expose_headers=["X-Request-ID", "Retry-After", "Idempotent-Replayed"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(LoadShedMiddleware)
    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.TRUSTED_PROXIES)

    install_exception_handlers(app)

    api = APIRouter(prefix=settings.API_PREFIX)
    for router in (
        auth_router,
        users_router,
        categories_router,
        products_router,
        orders_router,
        notifications_router,
        analytics_router,
        realtime_router,
    ):
        api.include_router(router)
    app.include_router(api)
    app.include_router(health.router)

    if settings.STORAGE_BACKEND == "local":
        media_root = Path(settings.MEDIA_ROOT)
        media_root.mkdir(parents=True, exist_ok=True)
        app.mount(settings.MEDIA_URL, StaticFiles(directory=media_root), name="media")

    return app


app = create_app()
