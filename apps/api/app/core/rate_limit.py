"""Sliding-window rate limiter executed atomically inside Redis (Lua).

A sliding log is exact but O(limit) memory per key; at very large scale a weighted two-bucket
counter is O(1).
"""

import logging
import time
from dataclasses import dataclass
from uuid import uuid4

from redis.exceptions import RedisError

from app.core.metrics import RATE_LIMITED
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = tonumber(oldest[2]) + window - now end
  return {0, count, retry}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
"""


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int
    member: str | None = None  # the slot taken, so the caller can release() it


class RateLimiterUnavailable(Exception):
    pass


async def hit(key: str, limit: int, window_seconds: int, scope: str) -> RateLimitResult:
    now_ms = int(time.time() * 1000)
    window_ms = window_seconds * 1000
    member = f"{now_ms}:{uuid4().hex[:8]}"
    try:
        allowed, count, retry_ms = await get_redis().eval(
            _SLIDING_WINDOW, 1, f"lux:rl:{key}", now_ms, window_ms, limit, member
        )
    except RedisError as exc:
        raise RateLimiterUnavailable(str(exc)) from exc
    if not allowed:
        RATE_LIMITED.labels(scope).inc()
    return RateLimitResult(
        allowed=bool(allowed),
        limit=limit,
        remaining=max(0, limit - int(count)),
        retry_after_seconds=max(1, int(retry_ms) // 1000 + 1) if not allowed else 0,
        member=member if allowed else None,
    )


async def release(key: str, member: str) -> None:
    """Give back a slot taken by :func:`hit` (e.g. a login attempt that turned out to succeed)."""
    try:
        await get_redis().zrem(f"lux:rl:{key}", member)
    except RedisError as exc:
        raise RateLimiterUnavailable(str(exc)) from exc
