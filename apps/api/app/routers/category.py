from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_roles
from app.database import get_session
from app.models.user import UserRole
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from app.services.category import CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryRead], status_code=status.HTTP_200_OK)
async def list_categories(session: AsyncSession = Depends(get_session)):
    service = CategoryService(session)
    return await service.list()


@router.post(
    "/",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def create_category(data: CategoryCreate, session: AsyncSession = Depends(get_session)):
    service = CategoryService(session)
    return await service.create(data)


@router.patch(
    "/{category_id}",
    response_model=CategoryRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    session: AsyncSession = Depends(get_session),
):
    service = CategoryService(session)
    return await service.update(category_id, data)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def delete_category(category_id: int, session: AsyncSession = Depends(get_session)):
    service = CategoryService(session)
    return await service.delete(category_id)
