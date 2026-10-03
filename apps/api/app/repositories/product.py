from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.models.product import Product


class ProductRepository:
    _UPDATABLE_FIELDS = frozenset({
        "name", "price", "description", "short_description",
        "is_offer", "category_id", "highlights",
    })

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, name: str, price: float, description: str, is_offer: bool, category_id: int | None, short_description: str, highlights: bool | None) -> Product:
        product = Product(
            name=name,
            price=price,
            description=description,
            short_description=short_description,
            is_offer=is_offer,
            category_id=category_id,
            highlights=highlights,
        )
        self.session.add(product)
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def search_name(self, product_name: str) -> Product | None:
        result = await self.session.execute(select(Product).filter(Product.name == product_name))
        return result.scalars().first()

    async def search_id(self, product_id: int) -> Product | None:
        result = await self.session.execute(select(Product).filter(Product.id == product_id))
        return result.scalars().first()

    async def list(self, limit: int = 10, cursor: int = 0) -> list[Product]:
        result = await self.session.execute(
            select(Product)
            .filter(Product.id > cursor)
            .order_by(Product.id.asc())
            .limit(limit)
        )
        return result.scalars().all()

    async def list_by_ids(self, product_ids: List[int]) -> List[Product]:
        if not product_ids:
            return []
        result = await self.session.execute(
            select(Product).filter(Product.id.in_(product_ids))
        )
        return result.scalars().all()

    async def delete(self, product_id: int) -> Product | None:
        product = await self.search_id(product_id)
        if not product:
            return None
        await self.session.delete(product)
        await self.session.flush()
        return product

    async def update(self, product_id: int, data: dict) -> Product | None:
        product = await self.search_id(product_id)
        if not product:
            return None

        # M-02: only allow known-safe fields to prevent mass-assignment.
        for key, value in data.items():
            if key not in self._UPDATABLE_FIELDS:
                raise ValueError(f"Campo '{key}' nao e atualizavel.")
            setattr(product, key, value)

        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def update_image_url(self, product_id: int, image_url: str) -> Product | None:
        product = await self.search_id(product_id)
        if not product:
            return None

        product.image_url = image_url
        await self.session.flush()
        await self.session.refresh(product)
        return product
