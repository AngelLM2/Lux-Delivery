from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.category import CategoryRepository
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.services.cache_service import CacheService


class CategoryService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = CategoryRepository(session)
        self.cache = CacheService

    async def _ensure_exists(self, category_id: int):
        category = await self.repo.search_id(category_id)
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria nao encontrada.",
            )
        return category

    async def create(self, data: CategoryCreate):
        if await self.repo.search_name(data.name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria ja existe.",
            )
        category = await self.repo.create(data.name)
        await self.cache.delete(self.cache.key_categories_list())
        return category

    async def delete(self, category_id: int):
        await self._ensure_exists(category_id)
        await self.repo.delete(category_id)
        await self.cache.delete(self.cache.key_categories_list())
        return {"message": f"Categoria {category_id} removida com sucesso."}

    async def update(self, category_id: int, data: CategoryUpdate):
        category = await self._ensure_exists(category_id)
        if data.name != category.name and await self.repo.search_name(data.name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Categoria ja existe.",
            )
        updated = await self.repo.update(category_id, data.model_dump(exclude_unset=True))
        await self.cache.delete(self.cache.key_categories_list())
        return updated

    async def list(self):
        key = self.cache.key_categories_list()
        cached = await self.cache.get(key)
        if cached is not None:
            return cached

        categories = await self.repo.list()
        payload = [{"id": c.id, "name": c.name} for c in categories]
        await self.cache.set(key, payload, settings.TTL_CATEGORIES)
        return payload
