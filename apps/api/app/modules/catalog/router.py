from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.errors import BadRequest, PayloadTooLarge
from app.modules.catalog.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    ProductCreate,
    ProductPage,
    ProductRead,
    ProductUpdate,
)
from app.modules.catalog.service import CategoryService, ProductService
from app.modules.catalog.storage import get_storage
from app.modules.identity.dependencies import Principal, require_admin

categories_router = APIRouter(prefix="/categories", tags=["catalog"])
products_router = APIRouter(prefix="/products", tags=["catalog"])

_PUBLIC_CACHE = "public, max-age=30, stale-while-revalidate=120"
_CHUNK = 256 * 1024


def _json(raw: str, cache_control: str | None = None) -> Response:
    """Return already-serialised JSON as-is. The cached text was produced from the same
    response schema, so re-validating it on every hit would only burn CPU."""
    headers = {"Cache-Control": cache_control} if cache_control else None
    return Response(content=raw, media_type="application/json", headers=headers)


@categories_router.get("", response_model=list[CategoryRead])
async def list_categories(session: AsyncSession = Depends(get_session)):
    return _json(await CategoryService(session).list_json(), cache_control=_PUBLIC_CACHE)


@categories_router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate, _: Principal = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    return await CategoryService(session).create(data)


@categories_router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await CategoryService(session).update(category_id, data)


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int, _: Principal = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    await CategoryService(session).delete(category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@products_router.get("", response_model=ProductPage)
async def list_products(
    limit: int = Query(default=20, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = None,
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=60),
    offers_only: bool = False,
    highlights_only: bool = False,
    session: AsyncSession = Depends(get_session),
):
    raw = await ProductService(session).list(
        limit=limit,
        cursor=cursor,
        category_id=category_id,
        search=q,
        offers_only=offers_only,
        highlights_only=highlights_only,
    )
    return _json(raw, cache_control=_PUBLIC_CACHE)


@products_router.get("/admin", response_model=ProductPage)
async def list_products_admin(
    limit: int = Query(default=50, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = None,
    category_id: int | None = None,
    q: str | None = Query(default=None, max_length=60),
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin listing, including archived products, never cached."""
    raw = await ProductService(session).list(
        limit=limit, cursor=cursor, category_id=category_id, search=q, include_archived=True
    )
    return _json(raw)


@products_router.get("/{product_id}", response_model=ProductRead)
async def get_product(product_id: int, session: AsyncSession = Depends(get_session)):
    return await ProductService(session).get(product_id)


@products_router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate, _: Principal = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    return await ProductService(session).create(data)


@products_router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await ProductService(session).update(product_id, data)


@products_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_product(
    product_id: int, _: Principal = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    """Soft delete: the product leaves the menu but past orders keep referencing it."""
    await ProductService(session).archive(product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@products_router.post("/{product_id}/restore", response_model=ProductRead)
async def restore_product(
    product_id: int, _: Principal = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    return await ProductService(session).restore(product_id)


@products_router.post("/{product_id}/image", response_model=ProductRead)
async def upload_product_image(
    product_id: int,
    request: Request,
    file: UploadFile = File(...),
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.MAX_UPLOAD_SIZE + 64 * 1024:
        raise PayloadTooLarge("Arquivo muito grande.")
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_CHUNK):
        total += len(chunk)
        if total > settings.MAX_UPLOAD_SIZE:
            raise PayloadTooLarge(f"Arquivo muito grande (maximo {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB).")
        chunks.append(chunk)
    if not total:
        raise BadRequest("Arquivo vazio.", code="empty_file")
    return await ProductService(session).upload_image(product_id, b"".join(chunks), get_storage())
