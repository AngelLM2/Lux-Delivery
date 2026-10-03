import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from app.config import settings

_pool: ConnectionPool | None = None

async def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=20,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            retry_on_timeout=True,
        )
    return redis.Redis(connection_pool=_pool)


async def close_redis() -> None:
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None
