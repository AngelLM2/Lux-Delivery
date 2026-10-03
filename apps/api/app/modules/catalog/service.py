import hashlib
import json

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.config import settings
from app.core.database import utcnow
from app.core.errors import BadRequest, Conflict, NotFound
from app.core.pagination import cursor_id, encode_cursor
from app.modules.catalog.models import Category, Product
from app.modules.catalog.repository import CategoryRepository, ProductRepository
from app.modules.catalog.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    ProductCreate,
    ProductPage,
    ProductRead,
    ProductUpdate,
)
from app.modules.catalog.storage import Storage, process_image, product_image_key

CACHE_NAMESPACE = "catalog"


class CategoryService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = CategoryRepository(session)

    async def list_json(self) -> str:
        """JSON text of the category list, served straight from the cache on a hit."""

        async def load() -> list[dict]:
            return [CategoryRead.model_validate(c).model_dump(mode="json") for c in await self.repo.list()]

        return await cache.cached_json(CACHE_NAMESPACE, "categories", settings.TTL_CATALOG, load)

    async def create(self, data: CategoryCreate) -> Category:
        if await self.repo.get_by_name(data.name):
            raise Conflict("Categoria ja existe.", code="category_exists")
        category = await self.repo.add(Category(name=data.name, position=data.position))
        await self._commit()
        return category

    async def update(self, category_id: int, data: CategoryUpdate) -> Category:
        category = await self._get(category_id)
        changes = data.model_dump(exclude_unset=True, exclude_none=True)
        if not changes:
            raise BadRequest("Nenhum campo enviado para atualizacao.", code="empty_update")
        renamed = "name" in changes and changes["name"].lower() != category.name.lower()
        if renamed and await self.repo.get_by_name(changes["name"]):
            raise Conflict("Categoria ja existe.", code="category_exists")
        await self.repo.update(category, changes)
        await self._commit()
        return category

    async def delete(self, category_id: int) -> None:
        category = await self._get(category_id)
        # FK is ON DELETE SET NULL: products survive as "uncategorised".
        await self.repo.delete(category)
        await self._commit()

    async def _get(self, category_id: int) -> Category:
        category = await self.repo.get(category_id)
        if category is None:
            raise NotFound("Categoria nao encontrada.", code="category_not_found")
        return category

    async def _commit(self) -> None:
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise Conflict("Categoria ja existe.", code="category_exists") from None
        # Invalidate only after commit: invalidating before would let a concurrent reader
        # repopulate the cache with the old row before our transaction becomes visible.
        await cache.invalidate_namespace(CACHE_NAMESPACE)


class ProductService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ProductRepository(session)
        self.categories = CategoryRepository(session)

    async def list(
        self,
        *,
        limit: int,
        cursor: str | None,
        category_id: int | None = None,
        search: str | None = None,
        offers_only: bool = False,
        highlights_only: bool = False,
        include_archived: bool = False,
    ) -> str:
        """JSON text of one page. Public pages are cached; the admin view is always fresh."""
        params = {
            "limit": limit,
            "after": cursor_id(cursor),
            "category_id": category_id,
            "q": (search or "").strip().lower() or None,
            "offers": offers_only,
            "highlights": highlights_only,
            "archived": include_archived,
        }

        async def load() -> dict:
            rows = await self.repo.list_page(
                limit=limit + 1,
                after_id=params["after"],
                category_id=category_id,
                search=params["q"],
                offers_only=offers_only,
                highlights_only=highlights_only,
                include_archived=include_archived,
            )
            has_more = len(rows) > limit
            rows = rows[:limit]
            page = ProductPage(
                items=[ProductRead.model_validate(p) for p in rows],
                next_cursor=encode_cursor({"id": rows[-1].id}) if has_more and rows else None,
            )
            return page.model_dump(mode="json")

        if include_archived:
            return cache.dumps(await load())
        key = "products:" + hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:24]
        return await cache.cached_json(CACHE_NAMESPACE, key, settings.TTL_CATALOG, load)

    async def get(self, product_id: int, include_archived: bool = False) -> Product:
        product = await self.repo.get(product_id)
        if product is None or (product.archived_at is not None and not include_archived):
            raise NotFound("Produto nao encontrado.", code="product_not_found")
        return product

    async def create(self, data: ProductCreate) -> Product:
        if await self.repo.name_taken(data.name):
            raise Conflict("Ja existe um produto com este nome.", code="product_exists")
        await self._ensure_category(data.category_id)
        product = await self.repo.add(Product(**data.model_dump()))
        await self._commit()
        return product

    async def update(self, product_id: int, data: ProductUpdate) -> Product:
        product = await self.get(product_id)
        changes = data.model_dump(exclude_unset=True)
        if not changes:
            raise BadRequest("Nenhum campo enviado para atualizacao.", code="empty_update")
        for required in ("name", "price", "description", "short_description", "is_offer", "highlights", "is_available"):
            if required in changes and changes[required] is None:
                raise BadRequest(f"Campo '{required}' nao pode ser nulo.", code="null_field")
        if "name" in changes and await self.repo.name_taken(changes["name"], exclude_id=product_id):
            raise Conflict("Ja existe um produto com este nome.", code="product_exists")
        if "category_id" in changes:
            await self._ensure_category(changes["category_id"])
        await self.repo.update(product, changes)
        await self._commit()
        return product

    async def archive(self, product_id: int) -> None:
        product = await self.get(product_id)
        await self.repo.update(product, {"archived_at": utcnow(), "is_available": False})
        await self._commit()

    async def restore(self, product_id: int) -> Product:
        product = await self.get(product_id, include_archived=True)
        if product.archived_at is None:
            return product
        if await self.repo.name_taken(product.name, exclude_id=product.id):
            raise Conflict("Ja existe um produto ativo com este nome.", code="product_exists")
        await self.repo.update(product, {"archived_at": None})
        await self._commit()
        return product

    async def upload_image(self, product_id: int, data: bytes, storage: Storage) -> Product:
        await self.get(product_id)  # 404 before doing any work
        await self.session.rollback()  # no DB connection held during image processing and the S3 call
        webp = await process_image(data)
        url = await storage.save(product_image_key(product_id), webp, "image/webp")
        product = await self.get(product_id)
        await self.repo.update(product, {"image_url": url})
        await self._commit()
        return product

    async def _ensure_category(self, category_id: int | None) -> None:
        if category_id is not None and await self.categories.get(category_id) is None:
            raise NotFound("Categoria nao encontrada.", code="category_not_found")

    async def _commit(self) -> None:
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise Conflict("Ja existe um produto com este nome.", code="product_exists") from None
        await cache.invalidate_namespace(CACHE_NAMESPACE)
