import logging

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_token
from app.config import settings
from app.database import get_session
from app.models.user import UserRole
from app.repositories.user import UserRepository
from app.services.cache_service import CacheService

logger = logging.getLogger(__name__)


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
):
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nao autenticado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    cache_key = f"user:{user_id}"
    try:
        cached = await CacheService.get(cache_key)
        if cached is not None:
        
            if not cached.get("active"):
                await CacheService.delete(cache_key)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Usuario nao encontrado ou inativo.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            repo = UserRepository(session)
            user = await repo.search_by_id(int(user_id))
            if not user or not user.is_active:
                await CacheService.delete(cache_key)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Usuario nao encontrado ou inativo.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return user
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Cache get_current_user falhou: %s", exc)

    repo = UserRepository(session)
    user = await repo.search_by_id(int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario nao encontrado ou inativo.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        await CacheService.set(cache_key, {"id": user.id, "active": True}, settings.TTL_USER)
    except Exception as exc:
        logger.warning("Cache set get_current_user falhou: %s", exc)

    return user



def require_roles(*roles: UserRole):
    def _checker(user=Depends(get_current_user)):
        if roles and user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sem permissao para executar esta acao.",
            )
        return user

    return _checker