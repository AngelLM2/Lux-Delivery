"""Public interface of the catalog module: other modules use this, never catalog models/repositories.

If the catalog becomes its own service, only this file changes (into an HTTP/gRPC client).
"""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Product


@dataclass(frozen=True)
class OrderableProduct:
    id: int
    name: str
    price: Decimal
    is_available: bool


async def get_orderable_products(session: AsyncSession, product_ids: list[int]) -> dict[int, OrderableProduct]:
    if not product_ids:
        return {}
    rows = await session.execute(
        select(Product.id, Product.name, Product.price, Product.is_available).where(
            Product.id.in_(product_ids), Product.archived_at.is_(None)
        )
    )
    return {
        row.id: OrderableProduct(id=row.id, name=row.name, price=row.price, is_available=row.is_available)
        for row in rows
    }
