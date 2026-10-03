import json
import logging
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

class CacheService():
    @staticmethod
    async def get(key: str) -> Any | None:

        try:
            r: Redis = await get_redis()
            data = await r.get(key)
            return json.loads(data) if data else None
        except (RedisError, json.JSONDecodeError) as e:

            logger.warning("Redis GET falhou para '%s': %s", key, e)
            return None

    @staticmethod
    async def set(key: str, value: Any, ttl: int) -> None:

        try:
            r: Redis = await get_redis()
            await r.setex(key, ttl, json.dumps(value, default=str))
        except (RedisError, json.JSONDecodeError) as e:
            logger.warning("Redis SET falhou para '%s': %s", key, e)

    @staticmethod
    async def delete(key: str) -> None:
        try:
            r: Redis = await get_redis()
            await r.delete(key)
        except (RedisError, json.JSONDecodeError) as e:
            logger.warning("Redis DELETE falhou para '%s': %s", key, e)

    @staticmethod
    async def delete_pattern(pattern: str) -> int:
        try:
            r: Redis = await get_redis()
            deleted = 0
            async for key in r.scan_iter(match=pattern, count=100):
                await r.delete(key)
                deleted += 1
            return deleted
        except (RedisError, json.JSONDecodeError) as e:
            logger.warning("Redis DELETE PATTERN falhou para '%s': %s", pattern, e)
            return 0

    @staticmethod
    def key_products_list(cursor: int, limit: int) -> str:
        return f"products:list:{cursor}:{limit}"

    @staticmethod
    def key_categories_list() -> str:
        return "categories:list"

    @staticmethod
    def key_orders_user(user_id: int, role: str) -> str:
        return f"orders:user:{user_id}:{role}"

