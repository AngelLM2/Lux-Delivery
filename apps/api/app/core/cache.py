"""Cache-aside on Redis: versioned namespaces (O(1) invalidation), single-flight on miss, fail-open.

Hits are one Lua round trip and return the stored JSON as-is; the ``{namespace}`` hash tag keeps
version and data in one Redis Cluster slot. See docs/06-concorrencia-e-consistencia.md §5.
"""

import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import uuid4

from redis.exceptions import RedisError

from app.core.metrics import CACHE_REQUESTS
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_PREFIX = "lux:cache"
_LOCK_TTL_MS = 3000
_WAIT_STEP_SECONDS = 0.05
_WAIT_MAX_STEPS = 20

_READ = """
local version = redis.call('GET', KEYS[1]) or '0'
return {version, redis.call('GET', ARGV[1] .. version .. ':' .. ARGV[2])}
"""
_RELEASE_LOCK = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
"""


def _version_key(namespace: str) -> str:
    return f"{_PREFIX}:{{{namespace}}}:version"


def _data_prefix(namespace: str) -> str:
    return f"{_PREFIX}:{{{namespace}}}:v"


def dumps(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), ensure_ascii=False)


async def invalidate_namespace(namespace: str) -> None:
    """O(1) invalidation of every key in the namespace. Call it after the DB commit."""
    try:
        await get_redis().incr(_version_key(namespace))
    except RedisError as exc:
        logger.warning("cache_invalidate_failed", extra={"namespace": namespace, "error": str(exc)})


async def cached_json(namespace: str, key: str, ttl: int, loader: Callable[[], Awaitable[Any]]) -> str:
    """Return the JSON text for ``key``; on a miss, ``loader()`` builds the value."""
    redis = get_redis()
    try:
        version, raw = await redis.eval(_READ, 1, _version_key(namespace), _data_prefix(namespace), key)
    except RedisError as exc:
        logger.warning("cache_read_failed", extra={"namespace": namespace, "error": str(exc)})
        CACHE_REQUESTS.labels(namespace, "error").inc()
        return dumps(await loader())

    if raw is not None:
        CACHE_REQUESTS.labels(namespace, "hit").inc()
        return raw

    CACHE_REQUESTS.labels(namespace, "miss").inc()
    full_key = f"{_data_prefix(namespace)}{version}:{key}"
    lock_key = f"{full_key}:lock"
    token = uuid4().hex
    try:
        if not await redis.set(lock_key, token, nx=True, px=_LOCK_TTL_MS):
            for _ in range(_WAIT_MAX_STEPS):
                await asyncio.sleep(_WAIT_STEP_SECONDS)
                raw = await redis.get(full_key)
                if raw is not None:
                    return raw
            return dumps(await loader())
    except RedisError:
        return dumps(await loader())

    try:
        raw = dumps(await loader())
        try:
            await redis.set(full_key, raw, ex=ttl)
        except RedisError as exc:
            logger.warning("cache_write_failed", extra={"namespace": namespace, "error": str(exc)})
        return raw
    finally:
        with contextlib.suppress(RedisError):  # the lock also expires by itself
            await redis.eval(_RELEASE_LOCK, 1, lock_key, token)


async def cached(namespace: str, key: str, ttl: int, loader: Callable[[], Awaitable[Any]]) -> Any:
    """Same as :func:`cached_json` but returns the decoded value."""
    return json.loads(await cached_json(namespace, key, ttl, loader))
