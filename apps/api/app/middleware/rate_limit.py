import logging
import time
from uuid import uuid4

from fastapi import Request, status
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app.auth.jwt import decode_token
from app.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


def _get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _get_user_id_from_request(request: Request) -> str | None:
    """Tenta extrair o user_id do Bearer token (header) ou do cookie access_token."""
    token: str | None = None

    auth_header = request.headers.get("authorization")
    if auth_header:
        parts = auth_header.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            token = parts[1].strip()

    if not token:
        token = request.cookies.get("access_token")

    if not token:
        return None

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    return str(user_id) if user_id else None


def _rate_limit_response(window: int) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Muitas requisicoes. Tente novamente em instantes."},
        headers={"Retry-After": str(window)},
    )


def _service_unavailable_response() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Servico temporariamente indisponivel. Tente novamente em instantes."},
    )


async def rate_limit_middleware(request: Request, call_next):
    try:
        r = await get_redis()
        window = settings.RATE_LIMIT_WINDOW_SECONDS
        max_per_ip = settings.RATE_LIMIT_MAX_PER_IP
        max_per_user = settings.RATE_LIMIT_MAX_PER_USER

        now = time.time()
        cutoff = now - window

        client_ip = _get_client_ip(request)
        user_id = _get_user_id_from_request(request)

        keys: list[tuple[str, int]] = [(f"rate:ip:{client_ip}", max_per_ip)]
        if user_id:
            keys.append((f"rate:user:{user_id}", max_per_user))

        async with r.pipeline(transaction=True) as pipe:
            for key, _ in keys:
                pipe.zremrangebyscore(key, 0, cutoff)
                pipe.zcard(key)
                member = f"{now}:{uuid4().hex}"
                pipe.zadd(key, {member: now})
                pipe.expire(key, window)
            results = await pipe.execute()

        for idx, (_, limit) in enumerate(keys):
            count = results[idx * 4 + 1]
            if count >= limit:
                return _rate_limit_response(window)

    except RedisError as e:
        logger.error("Rate limiter Redis indisponivel: %s", e)
        return _service_unavailable_response()

    return await call_next(request)
