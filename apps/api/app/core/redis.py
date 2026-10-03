import redis.asyncio as redis
from redis.asyncio import BlockingConnectionPool

from app.core.config import settings

_pool: BlockingConnectionPool | None = None
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Shared client on one *blocking* pool per process (callers wait for a free connection).

    The default pool raises "Too many connections", which under load became a stampede on Postgres
    (docs/09-testes-de-carga.md §2).
    """
    global _pool, _client
    if _client is not None:
        # One client per process: building Redis() copies ~300 callbacks (~0.5 ms per request).
        return _client
    if _pool is None:
        _pool = BlockingConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            timeout=settings.REDIS_POOL_TIMEOUT_SECONDS,
            decode_responses=True,
            socket_connect_timeout=1.0,
            socket_timeout=2.0,
            health_check_interval=30,
        )
    _client = redis.Redis(connection_pool=_pool)
    return _client


def new_redis_connection(**overrides) -> redis.Redis:
    """Dedicated client for long-lived blocking work (pub/sub, XREADGROUP BLOCK)."""
    options = {"decode_responses": True, "socket_connect_timeout": 1.0, "health_check_interval": 30}
    options.update(overrides)
    return redis.Redis.from_url(settings.REDIS_URL, **options)


async def close_redis() -> None:
    global _pool, _client
    _client = None
    if _pool is not None:
        await _pool.aclose()
        _pool = None
