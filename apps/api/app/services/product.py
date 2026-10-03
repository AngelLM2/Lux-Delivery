from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.category import CategoryRepository
from app.repositories.product import ProductRepository
from app.schemas.product import ProductCreate, ProductUpdate
from app.services.cache_service import CacheService
from app.services.storage import StorageService


class ProductService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ProductRepository(session)
        self.category_repo = CategoryRepository(session)
        self.cache = CacheService
        self.ttl = settings.TTL_PRODUCTS_LIST
        self.storage = StorageService

    async def create(self, data: ProductCreate):
        if await self.repo.search_name(data.name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Produto ja existe.",
            )
        if data.category_id and not await self.category_repo.search_id(data.category_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoria nao encontrada.",
            )
        product = await self.repo.create(
            name=data.name,
            price=data.price,
            description=data.description,
            short_description=data.short_description,
            is_offer=data.is_offer,
            category_id=data.category_id,
            highlights=data.highlights,
        )
        await self.cache.delete_pattern("products:list:*")
        return product

    async def list(self, limit: int = 10, cursor: int = 0):
        key = self.cache.key_products_list(cursor, limit)
        cached = await self.cache.get(key)
        if cached is not None:
            return cached

        products = await self.repo.list(limit=limit, cursor=cursor)
        payload = [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "short_description": c.short_description,
                "image_url": c.image_url,
                "is_offer": c.is_offer,
                "price": c.price,
                "category_id": c.category_id,
                "highlights": c.highlights,
            }
            for c in products
        ]
        await self.cache.set(key, payload, self.ttl)
        return payload

    async def delete(self, product_id: int):
        deleted = await self.repo.delete(product_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado.",
            )
        await self.cache.delete_pattern("products:list:*")
        return {"message": f"Produto {product_id} removido com sucesso."}

    async def update(self, product_id: int, data: ProductUpdate):
        payload = data.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo enviado para atualizacao.",
            )
        if "category_id" in payload and payload["category_id"] is not None:
            if not await self.category_repo.search_id(payload["category_id"]):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Categoria nao encontrada.",
                )
        updated = await self.repo.update(product_id, payload)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado.",
            )
        await self.cache.delete_pattern("products:list:*")
        return updated

    async def get_by_id(self, product_id: int):
        product = await self.repo.search_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado.",
            )
        return product

    async def update_image_url(self, product_id: int, file_bytes: bytes, content_type: str):
        product = await self.repo.search_id(product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado.",
            )
        image_url = await self.storage().upload_product_image(
            product_id=product_id,
            file_bytes=file_bytes,
            content_type=content_type,
        )
        updated = await self.repo.update_image_url(product_id, image_url)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Produto nao encontrado.",
            )
        await self.cache.delete_pattern("products:list:*")
        return updated
