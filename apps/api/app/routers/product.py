from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_roles
from app.config import settings
from app.database import get_session
from app.models.user import UserRole
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.product import ProductService

router = APIRouter(prefix="/products", tags=["products"])

_CHUNK_SIZE = 256 * 1024

_ALLOWED_IMAGE_TYPES = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
})

_IMAGE_MAGIC = (
    (b"\xff\xd8\xff", "image/jpeg"),       
    (b"\x89PNG\r\n\x1a\n", "image/png"),    
    (b"RIFF", "image/webp"),                 
    (b"GIF87a", "image/gif"),               
    (b"GIF89a", "image/gif"),                
)


def _validate_image_magic(data: bytes, declared_mime: str) -> None:
    """M-05: reject uploads whose first bytes don't match an image signature."""
    for magic, mime in _IMAGE_MAGIC:
        if data[:len(magic)] == magic:
            if magic == b"RIFF" and data[8:12] != b"WEBP":
                continue
            return  # valid image header found
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Arquivo nao e uma imagem valida (assinatura de bytes invalida).",
    )


@router.get("/", response_model=list[ProductRead], status_code=status.HTTP_200_OK)
async def list_products(
    limit: int = Query(default=20, ge=1, le=settings.PRODUCTS_MAX_PAGE_SIZE),
    cursor: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    service = ProductService(session)
    return await service.list(limit=limit, cursor=cursor)


@router.get("/{product_id}", response_model=ProductRead, status_code=status.HTTP_200_OK)
async def get_product(product_id: int, session: AsyncSession = Depends(get_session)):
    service = ProductService(session)
    return await service.get_by_id(product_id)


@router.post(
    "/",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def create_product(
    data: ProductCreate,
    session: AsyncSession = Depends(get_session),
):
    service = ProductService(session)
    return await service.create(data)


@router.patch(
    "/{product_id}",
    response_model=ProductRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    session: AsyncSession = Depends(get_session),
):
    service = ProductService(session)
    return await service.update(product_id, data)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def delete_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
):
    service = ProductService(session)
    return await service.delete(product_id)


@router.post(
    "/{product_id}/image",
    response_model=ProductRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
async def upload_product_image(
    product_id: int,
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=f"Arquivo muito grande. Tamanho maximo: {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
                )
        except ValueError:
            pass

    chunks: list[bytes] = []
    total_read = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Arquivo muito grande. Tamanho maximo: {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo enviado esta vazio.",
        )

    content_type = file.content_type or ""
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Tipo de arquivo '{content_type}' nao permitido. "
                f"Tipos aceitos: {', '.join(sorted(_ALLOWED_IMAGE_TYPES))}."
            ),
        )

    _validate_image_magic(file_bytes, content_type)

    service = ProductService(session)
    return await service.update_image_url(
        product_id=product_id,
        file_bytes=file_bytes,
        content_type=content_type,
    )
