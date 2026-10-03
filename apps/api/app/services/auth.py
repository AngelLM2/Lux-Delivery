import logging
from datetime import datetime, timezone
import secrets

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_refresh_token_expiry,
    hash_token_jti,
    verify_password,
)
from app.config import settings
from app.repositories.user import UserRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.schemas.auth import LoginRequest
from app.schemas.user import UserCreate
from app.models.user import UserRole
from app.services.user import UserService


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)
        self.refresh_repo = RefreshTokenRepository(session)
        self.user_service = UserService(session)

    def _validate_bootstrap_token(self, provided_token: str | None) -> None:
        expected_token = settings.BOOTSTRAP_ADMIN_TOKEN
        if not expected_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bootstrap admin desabilitado no ambiente atual.",
            )
        if not provided_token or not secrets.compare_digest(provided_token, expected_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token de bootstrap invalido.",
            )

    async def _issue_refresh_token(self, user_id: int) -> str:
        refresh_token, jti = create_refresh_token(user_id)
        await self.refresh_repo.create(
            user_id=user_id,
            jti_hash=hash_token_jti(jti),
            expires_at=get_refresh_token_expiry(),
        )
        return refresh_token

    async def register(self, data: UserCreate):
        payload = data.model_copy(update={"role": UserRole.CUSTOMER})
        return await self.user_service.create(payload)

    async def bootstrap_admin(self, data: UserCreate, bootstrap_token: str | None):
        self._validate_bootstrap_token(bootstrap_token)
        await self.repo.lock_bootstrap_admin()
        if await self.repo.admin_exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Administrador inicial ja foi criado.",
            )
        payload = data.model_copy(update={"role": UserRole.ADMIN})
        return await self.user_service.create(payload)

    async def login(self, data: LoginRequest):
        user = await self.repo.search_by_email(data.email)
        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais invalidas.",
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario inativo.",
            )
        refresh_token = await self._issue_refresh_token(user.id)

        return {
            "access_token": create_access_token(user.id, user.role.value),
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    async def logout(self, refresh_token: str) -> None:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return

        jti = payload.get("jti")
        if not jti:
            return

        token_record = await self.refresh_repo.search_by_jti_hash(
            jti_hash=hash_token_jti(jti),
            lock_for_update=True,
        )
        if token_record and token_record.revoked_at is None:
            await self.refresh_repo.revoke(token_record, replaced_by_jti_hash=None)

    async def refresh(self, refresh_token: str):
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token invalido ou expirado.",
            )
        user_id_raw = payload.get("sub")
        jti = payload.get("jti")
        if not user_id_raw or not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token invalido.",
            )

        try:
            user_id = int(user_id_raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token invalido.",
            )

        token_record = await self.refresh_repo.search_by_jti_hash(
            jti_hash=hash_token_jti(jti),
            lock_for_update=True,
        )
        now = datetime.now(timezone.utc)
        if token_record and token_record.expires_at.tzinfo is None:
            now = now.replace(tzinfo=None)
        if (
            not token_record
            or token_record.user_id != user_id
            or token_record.revoked_at is not None
            or token_record.expires_at <= now
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token invalido ou revogado.",
            )

        user = await self.repo.search_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario nao encontrado ou inativo.",
            )

        new_refresh_token, new_jti = create_refresh_token(user.id)
        new_jti_hash = hash_token_jti(new_jti)
        await self.refresh_repo.revoke(token_record, replaced_by_jti_hash=new_jti_hash)
        await self.refresh_repo.create(
            user_id=user.id,
            jti_hash=new_jti_hash,
            expires_at=get_refresh_token_expiry(),
        )

        return {
            "access_token": create_access_token(user.id, user.role.value),
            "refresh_token": new_refresh_token,
        }
