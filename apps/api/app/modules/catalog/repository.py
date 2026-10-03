from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Category, Product


class CategoryRepository:
    _UPDATABLE = frozenset({"name", "position"})

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, category: Category) -> Category:
        self.session.add(category)
        await self.session.flush()
        return category

    async def get(self, category_id: int) -> Category | None:
        return await self.session.get(Category, category_id)

    async def get_by_name(self, name: str) -> Category | None:
        query = select(Category).where(func.lower(Category.name) == name.lower())
        return (await self.session.execute(query)).scalar_one_or_none()

    async def list(self) -> list[Category]:
        query = select(Category).order_by(Category.position.asc(), Category.name.asc())
        return list((await self.session.execute(query)).scalars())

    async def update(self, category: Category, changes: dict) -> Category:
        for key, value in changes.items():
            if key not in self._UPDATABLE:
                raise ValueError(f"Campo '{key}' nao e atualizavel.")
            setattr(category, key, value)
        await self.session.flush()
        return category

    async def delete(self, category: Category) -> None:
        await self.session.delete(category)
        await self.session.flush()


class ProductRepository:
    _UPDATABLE = frozenset(
        {
            "name",
            "price",
            "description",
            "short_description",
            "image_url",
            "is_offer",
            "highlights",
            "is_available",
            "category_id",
            "archived_at",
        }
    )

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, product: Product) -> Product:
        self.session.add(product)
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def get(self, product_id: int) -> Product | None:
        return await self.session.get(Product, product_id)

    async def name_taken(self, name: str, exclude_id: int | None = None) -> bool:
        query = select(Product.id).where(func.lower(Product.name) == name.lower(), Product.archived_at.is_(None))
        if exclude_id:
            query = query.where(Product.id != exclude_id)
        return (await self.session.execute(query.limit(1))).scalar_one_or_none() is not None

    async def list_page(
        self,
        *,
        limit: int,
        after_id: int | None,
        category_id: int | None,
        search: str | None,
        offers_only: bool,
        highlights_only: bool,
        include_archived: bool,
    ) -> list[Product]:
        query = select(Product).order_by(Product.id.asc()).limit(limit)
        if after_id:
            query = query.where(Product.id > after_id)
        if not include_archived:
            query = query.where(Product.archived_at.is_(None))
        if category_id:
            query = query.where(Product.category_id == category_id)
        if search:
            query = query.where(func.lower(Product.name).like(f"%{search.lower()}%"))
        if offers_only:
            query = query.where(Product.is_offer.is_(True))
        if highlights_only:
            query = query.where(Product.highlights.is_(True))
        return list((await self.session.execute(query)).scalars())

    async def list_by_ids(self, ids: list[int]) -> list[Product]:
        if not ids:
            return []
        return list((await self.session.execute(select(Product).where(Product.id.in_(ids)))).scalars())

    async def update(self, product: Product, changes: dict) -> Product:
        for key, value in changes.items():
            if key not in self._UPDATABLE:
                raise ValueError(f"Campo '{key}' nao e atualizavel.")
            setattr(product, key, value)
        await self.session.flush()
        await self.session.refresh(product)
        return product
