from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.redis_client import close_redis, get_redis
from app.middleware.rate_limit import rate_limit_middleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.database import Base, engine
from app.config import settings
from app.routers import (
    analytics_router,
    auth_router,
    category_router,
    notification_router,
    order_router,
    product_router,
    user_router,
)

logger = logging.getLogger(__name__)

_IS_PRODUCTION = settings.is_production

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        r = await get_redis()
        await r.ping()
        logger.info("Redis conectado com sucesso.")
    except Exception as exc:
        logger.warning("Redis indisponivel no startup: %s", exc)
    yield
    try:
        await close_redis()
    except Exception as exc:
        logger.warning("Falha ao fechar Redis: %s", exc)
    try:
        await engine.dispose()
    except Exception as exc:
        logger.warning("Falha ao fechar engine do banco: %s", exc)



app = FastAPI(
    title="Lux Delivery API",
    version="2.0",
    lifespan=lifespan,
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None if _IS_PRODUCTION else "/redoc",
    openapi_url=None if _IS_PRODUCTION else "/openapi.json",
)


origins = settings.CORS_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Bootstrap-Token"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)


app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.TRUSTED_PROXIES)
app.add_middleware(SecurityHeadersMiddleware)
app.middleware("http")(rate_limit_middleware)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(product_router)
app.include_router(category_router)
app.include_router(order_router)
app.include_router(notification_router)
app.include_router(analytics_router)



@app.get("/", tags=["health"])
async def health():
    from app.database import SessionLocal

    db_ok = redis_ok = True
    try:
        async with SessionLocal() as s:
            await s.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    try:
        r = await get_redis()
        await r.ping()
    except Exception:
        redis_ok = False
    overall = "ok" if (db_ok and redis_ok) else "degraded"
    return {"status": overall, "db": db_ok, "redis": redis_ok}
