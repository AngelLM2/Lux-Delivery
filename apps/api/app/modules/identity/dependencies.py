from dataclasses import dataclass

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.errors import Forbidden, ServiceUnavailable, TooManyRequests, Unauthorized
from app.core.logging import user_id_ctx
from app.core.rate_limit import RateLimiterUnavailable, hit
from app.core.security import ACCESS_COOKIE, decode_token
from app.modules.identity.models import User, UserRole
from app.modules.identity.service import get_user_status, is_access_token_revoked

# Lets Swagger UI and non-browser clients authenticate with a Bearer token; the browser uses
# the HttpOnly cookie. auto_error=False because the cookie is the primary channel.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/token", auto_error=False)


@dataclass(frozen=True)
class Principal:
    """Who is calling. Cheap to build: JWT + cached status, no full user row."""

    id: int
    role: UserRole
    token_jti: str
    token_exp: int

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


def _extract_token(request: Request, bearer: str | None) -> str | None:
    return bearer or request.cookies.get(ACCESS_COOKIE)


async def get_principal(
    request: Request,
    bearer: str | None = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> Principal:
    token = _extract_token(request, bearer)
    if not token:
        raise Unauthorized("Nao autenticado.", code="not_authenticated", headers={"WWW-Authenticate": "Bearer"})
    payload = decode_token(token, "access")
    if payload is None:
        raise Unauthorized("Token invalido ou expirado.", code="invalid_token", headers={"WWW-Authenticate": "Bearer"})
    if await is_access_token_revoked(payload["jti"]):
        raise Unauthorized("Sessao encerrada.", code="token_revoked")

    user_id = int(payload["sub"])
    status = await get_user_status(session, user_id)
    if status is None or not status[0]:
        raise Unauthorized("Usuario nao encontrado ou inativo.", code="user_inactive")

    user_id_ctx.set(user_id)
    # The role comes from the DB-backed status, not from the token: demotions apply immediately.
    return Principal(id=user_id, role=status[1], token_jti=payload["jti"], token_exp=int(payload["exp"]))


async def get_current_user(
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, principal.id)
    if user is None:
        raise Unauthorized("Usuario nao encontrado.", code="user_inactive")
    return user


def require_roles(*roles: UserRole):
    async def _checker(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise Forbidden("Sem permissao para executar esta acao.")
        return principal

    return _checker


require_admin = require_roles(UserRole.ADMIN)


async def auth_rate_limit(request: Request) -> None:
    """Strict per-IP limit on credential endpoints. Fails closed: brute force protection must
    not silently disappear when Redis is unavailable."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    client_ip = request.client.host if request.client else "unknown"
    # The route template, not request.url: the URL is rebuilt from the Host header, so a crafted
    # Host gave every request a fresh bucket.
    route = getattr(request.scope.get("route"), "path", None) or request.scope["path"]
    try:
        result = await hit(
            f"auth:{route}:{client_ip}",
            settings.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
            settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
            "auth_ip",
        )
    except RateLimiterUnavailable:
        raise ServiceUnavailable("Servico temporariamente indisponivel.") from None
    if not result.allowed:
        raise TooManyRequests(
            "Muitas tentativas. Tente novamente em instantes.",
            headers={"Retry-After": str(result.retry_after_seconds)},
        )
