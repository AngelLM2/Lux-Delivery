from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_roles
from app.database import get_session
from app.models.user import UserRole
from app.schemas.user import AdminUserCreate, UserCreate, UserRead, UserUpdate
from app.services.user import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "/",
    response_model=list[UserRead],
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def list_users(session: AsyncSession = Depends(get_session)):
    service = UserService(session)
    return await service.list()


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def create_user(data: AdminUserCreate, session: AsyncSession = Depends(get_session)):
    service = UserService(session)
    return await service.create(data)


@router.get("/me", response_model=UserRead, status_code=status.HTTP_200_OK)
async def get_profile(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserRead, status_code=status.HTTP_200_OK)
async def update_profile(
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = UserService(session)
    return await service.update_self(current_user, data)


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def deactivate_user(user_id: int, session: AsyncSession = Depends(get_session)):
    service = UserService(session)
    return await service.deactivate(user_id)


@router.patch(
    "/{user_id}/activate",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def activate_user(user_id: int, session: AsyncSession = Depends(get_session)):
    service = UserService(session)
    return await service.activate(user_id)  