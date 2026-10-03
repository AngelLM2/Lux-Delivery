import asyncio
import io
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from PIL import Image
from supabase import Client, create_client

from app.config import settings

_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_WEBP_QUALITY = 85


def _to_webp_bytes(file_bytes: bytes, content_type: str) -> bytes:
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado nao e uma imagem valida.",
        )

    image = Image.open(io.BytesIO(file_bytes))
    image_format = image.format
    if image_format not in _ALLOWED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato de imagem nao permitido: {image_format}. Use JPEG, PNG, WEBP ou GIF.",
        )

    has_alpha = "A" in image.getbands()
    target_mode = "RGBA" if has_alpha else "RGB"
    if image.mode != target_mode:
        image = image.convert(target_mode)

    output = io.BytesIO()
    image.save(output, format="WEBP", quality=_WEBP_QUALITY, method=6)
    return output.getvalue()


class StorageService:
    def __init__(self) -> None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase credentials are not configured.",
            )
        self.bucket = settings.SUPABASE_BUCKET
        self.client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    async def upload_product_image(self, product_id: int, file_bytes: bytes, content_type: str) -> str:
        if content_type not in _ALLOWED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Apenas imagens JPEG, PNG, WEBP ou GIF sao permitidas.",
            )

        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arquivo enviado esta vazio.",
            )

        webp_bytes = _to_webp_bytes(file_bytes, content_type)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        object_path = f"products/{product_id}/{timestamp}-{uuid4().hex}.webp"

        try:
            await asyncio.to_thread(
                lambda: self.client.storage.from_(self.bucket).upload(
                    path=object_path,
                    file=webp_bytes,
                    file_options={"content-type": "image/webp", "upsert": "true"},
                )
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to upload image to storage.",
            ) from exc

        return f"{settings.SUPABASE_URL}/storage/v1/object/public/{self.bucket}/{object_path}"
