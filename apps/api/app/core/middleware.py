"""Pure ASGI middlewares.

``BaseHTTPMiddleware`` adds a task per response and buffers the stream, which breaks SSE.
"""

import json
import logging
import re
import time
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.core.logging import request_id_ctx, user_id_ctx
from app.core.metrics import HTTP_IN_PROGRESS, HTTP_LATENCY, HTTP_REQUESTS, LOAD_SHED
from app.core.rate_limit import RateLimiterUnavailable, hit
from app.core.security import ACCESS_COOKIE, decode_token

access_logger = logging.getLogger("lux.access")
logger = logging.getLogger(__name__)

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_UNTRACKED_PATHS = ("/metrics", "/health/")


def _route_template(scope: Scope) -> str:
    route = scope.get("route")
    path = getattr(route, "path", None)
    if path:
        return path
    if scope["path"].startswith(settings.MEDIA_URL):
        return f"{settings.MEDIA_URL}/*"
    return "unmatched"


class ObservabilityMiddleware:
    """Request id propagation, structured access log and RED metrics in one pass."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, b"x-request-id")
        request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else uuid4().hex
        token = request_id_ctx.set(request_id)
        user_token = user_id_ctx.set(None)
        status_code = 500
        response_started = False
        started = time.perf_counter()
        HTTP_IN_PROGRESS.inc()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            # Handled here (not by Starlette's outermost ServerErrorMiddleware) so the 500 still
            # carries the request id in the body and header, and the log line is correlated.
            logger.exception("unhandled_error")
            if response_started:
                raise
            await _send_json(
                send_wrapper,
                500,
                {"detail": "Erro interno. Tente novamente.", "code": "internal_error", "request_id": request_id},
            )
        finally:
            elapsed = time.perf_counter() - started
            HTTP_IN_PROGRESS.dec()
            path = scope["path"]
            if not path.startswith(_UNTRACKED_PATHS):
                route = _route_template(scope)
                method = scope["method"]
                HTTP_REQUESTS.labels(method, route, str(status_code)).inc()
                HTTP_LATENCY.labels(method, route).observe(elapsed)
                access_logger.info(
                    "request",
                    extra={
                        "method": method,
                        "path": path,
                        "route": route,
                        "status": status_code,
                        "duration_ms": round(elapsed * 1000, 2),
                        "client_ip": (scope.get("client") or ("-",))[0],
                    },
                )
            request_id_ctx.reset(token)
            user_id_ctx.reset(user_token)


_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
]
_HSTS = (b"strict-transport-security", b"max-age=63072000; includeSubDomains")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self.headers = _SECURITY_HEADERS + ([_HSTS] if settings.is_production else [])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {name.lower() for name, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    header for header in self.headers if header[0] not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_wrapper)


_RATE_LIMIT_EXEMPT = ("/health", "/metrics", "/docs", "/redoc", "/openapi.json")


class RateLimitMiddleware:
    """Global limiter per client IP and per authenticated user.

    Fails open so a Redis outage is not a full outage; auth routes use a fail-closed limiter.
    """

    def __init__(self, app: ASGIApp):
        self.app = app
        self.window = settings.RATE_LIMIT_WINDOW_SECONDS

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or not settings.RATE_LIMIT_ENABLED
            or scope["method"] == "OPTIONS"
            or scope["path"].startswith(_RATE_LIMIT_EXEMPT)
            or scope["path"].startswith(settings.MEDIA_URL)
            or scope["path"].endswith("/events/stream")
        ):
            await self.app(scope, receive, send)
            return

        client_ip = (scope.get("client") or ("unknown",))[0]
        checks = [(f"ip:{client_ip}", settings.RATE_LIMIT_MAX_PER_IP, "ip")]
        user_id = _user_id_from_scope(scope)
        if user_id:
            checks.append((f"user:{user_id}", settings.RATE_LIMIT_MAX_PER_USER, "user"))

        try:
            for key, limit, scope_name in checks:
                result = await hit(key, limit, self.window, scope_name)
                if not result.allowed:
                    await _reject(send, result.retry_after_seconds, limit)
                    return
        except RateLimiterUnavailable as exc:
            logger.warning("rate_limiter_unavailable_fail_open", extra={"error": str(exc)})

        await self.app(scope, receive, send)


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


def _user_id_from_scope(scope: Scope) -> str | None:
    token = None
    auth = _header(scope, b"authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        cookie_header = _header(scope, b"cookie") or ""
        for part in cookie_header.split(";"):
            name, _, value = part.strip().partition("=")
            if name == ACCESS_COOKIE:
                token = value
                break
    if not token:
        return None
    payload = decode_token(token, "access")
    return payload.get("sub") if payload else None


async def _send_json(send: Send, status: int, payload: dict, headers: list | None = None) -> None:
    body = json.dumps(payload).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
            + (headers or []),
        }
    )
    await send({"type": "http.response.body", "body": body})


async def _reject(send: Send, retry_after: int, limit: int) -> None:
    await _send_json(
        send,
        429,
        {
            "detail": "Muitas requisicoes. Tente novamente em instantes.",
            "code": "rate_limited",
            "request_id": request_id_ctx.get(),
        },
        headers=[
            (b"retry-after", str(retry_after).encode()),
            (b"x-ratelimit-limit", str(limit).encode()),
            (b"x-ratelimit-remaining", b"0"),
        ],
    )


class LoadShedMiddleware:
    """Per-process concurrency limit (load shedding); long-lived SSE streams are not counted.

    Past throughput x latency (Little's law) extra requests only queue, so answer 503 + Retry-After
    at once. See docs/adr/0009-um-processo-por-container-e-load-shedding.md.
    """

    def __init__(self, app: ASGIApp):
        self.app = app
        self.limit = settings.MAX_IN_FLIGHT_REQUESTS
        self.in_flight = 0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or self.limit <= 0
            or scope["path"].startswith(("/health", "/metrics"))
            or scope["path"].endswith("/events/stream")
        ):
            await self.app(scope, receive, send)
            return
        if self.in_flight >= self.limit:
            LOAD_SHED.inc()
            await _send_json(
                send,
                503,
                {
                    "detail": "Servico sobrecarregado. Tente novamente.",
                    "code": "overloaded",
                    "request_id": request_id_ctx.get(),
                },
                headers=[(b"retry-after", b"1")],
            )
            return
        self.in_flight += 1
        try:
            await self.app(scope, receive, send)
        finally:
            self.in_flight -= 1
