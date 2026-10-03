from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category


class CategoryRepository:
    _UPDATABLE_FIELDS = frozenset({"name"})

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, name: str) -> Category:
        category = Category(name=name)
        self.session.add(category)
        await self.session.flush()
        await self.session.refresh(category)
        return category

    async def delete(self, category_id: int) -> bool:
        category = await self.search_id(category_id)
        if not category:
            return False
        await self.session.delete(category)
        await self.session.flush()
        return True

    async def update(self, category_id: int, data: dict) -> Category | None:
        category = await self.search_id(category_id)
        if not category:
            return None
        for key, value in data.items():
            if key not in self._UPDATABLE_FIELDS:
                raise ValueError(f"Campo '{key}' nao e atualizavel.")
            setattr(category, key, value)

        await self.session.flush()
        await self.session.refresh(category)
        return category

    async def search_id(self, category_id: int) -> Category | None:
        result = await self.session.execute(select(Category).filter(Category.id == category_id))
        return result.scalars().first()

    async def search_name(self, name: str) -> Category | None:
        result = await self.session.execute(select(Category).filter(Category.name == name))
        return result.scalars().first()

    async def list(self) -> list[Category]:
        result = await self.session.execute(select(Category).order_by(Category.name.asc()))
        return result.scalars().all()
