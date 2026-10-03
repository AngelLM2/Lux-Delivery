from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_password_hash, verify_password
from app.models.user import User, UserRole
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserUpdate
from app.services.cache_service import CacheService


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = UserRepository(session)

    async def create(self, data: UserCreate) -> User:
        if await self.repo.search_by_email(data.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email ja cadastrado.",
            )
        if data.phone and await self.repo.search_by_phone(data.phone):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Telefone ja cadastrado.",
            )
        hashed_password = get_password_hash(data.password)
        user = await self.repo.create(
            full_name=data.full_name,
            email=data.email.lower(),
            phone=data.phone,
            hashed_password=hashed_password,
            role=getattr(data, "role", UserRole.CUSTOMER)
        )
        return user

    async def list(self) -> list[User]:
        return await self.repo.list()

    async def get_by_id(self, user_id: int) -> User:
        user = await self.repo.search_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado.")
        return user

    async def update_self(self, current_user: User, data: UserUpdate) -> User:
        payload = data.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo enviado para atualizacao.",
            )
        if payload.get("phone") and payload["phone"] != current_user.phone:
            if await self.repo.search_by_phone(payload["phone"]):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Telefone ja cadastrado.",
                )
        if payload.get("password"):
            if not verify_password(payload.pop("current_password", None) or "", current_user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Senha atual incorreta.",
                )
            payload.pop("password_confirm", None)
            payload["hashed_password"] = get_password_hash(payload.pop("password"))
        else:
            payload.pop("current_password", None)
            payload.pop("password_confirm", None)

        user = await self.repo.update(current_user, payload)
        if "hashed_password" in payload:
            await CacheService.delete(f"user:{current_user.id}")
        return user

    async def deactivate(self, user_id: int) -> User:
        user = await self.get_by_id(user_id)
        if user.role == UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nao e permitido desativar administrador",
            )
        result = await self.repo.update(user, {"is_active": False})
        # ARQ-03: Invalida cache imediatamente para bloquear requests em andamento
        await CacheService.delete(f"user:{user_id}")
        return result

    async def activate(self, user_id: int) -> User:
        user = await self.get_by_id(user_id)
        result = await self.repo.update(user, {"is_active": True})
        await CacheService.delete(f"user:{user_id}")
        return result
