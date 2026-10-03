"""Image storage port (Protocol) with ``LocalStorage`` (MEDIA_ROOT) and ``S3Storage`` adapters.

With more than one API node files must live outside the container (any S3-compatible service).
See docs/07-escalabilidade/03-estagio-2-100-a-1k-usuarios.md.
"""

import io
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import anyio
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.errors import BadRequest, ServiceUnavailable, UnsupportedMediaType

logger = logging.getLogger(__name__)

_MAGIC = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)
_ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
_MAX_SIDE = 1200
_MAX_PIXELS = 40_000_000  # decompression-bomb guard
_WEBP_QUALITY = 82


def sniff_image_type(data: bytes) -> str | None:
    """Trust the bytes, not the client's Content-Type header."""
    for magic, mime in _MAGIC:
        if data.startswith(magic):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _to_webp(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise BadRequest("O arquivo enviado nao e uma imagem valida.", code="invalid_image") from None
    if image.format not in _ALLOWED_FORMATS:
        raise UnsupportedMediaType("Formato de imagem nao suportado.", code="unsupported_image")
    if image.width * image.height > _MAX_PIXELS:
        raise BadRequest("Imagem grande demais.", code="image_too_large")

    image.thumbnail((_MAX_SIDE, _MAX_SIDE))
    mode = "RGBA" if "A" in image.getbands() else "RGB"
    if image.mode != mode:
        image = image.convert(mode)
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=_WEBP_QUALITY, method=4)
    return out.getvalue()


async def process_image(data: bytes) -> bytes:
    if not sniff_image_type(data):
        raise UnsupportedMediaType("Arquivo nao e uma imagem JPEG, PNG, WEBP ou GIF.", code="unsupported_image")
    # Decoding/encoding images is CPU bound: keep it off the event loop.
    return await anyio.to_thread.run_sync(_to_webp, data)


class Storage(Protocol):
    async def save(self, key: str, data: bytes, content_type: str) -> str: ...


class LocalStorage:
    def __init__(self, root: str, base_url: str):
        self.root = Path(root)
        self.base_url = base_url.rstrip("/")

    async def save(self, key: str, data: bytes, content_type: str) -> str:
        path = self.root / key
        await anyio.to_thread.run_sync(lambda: (path.parent.mkdir(parents=True, exist_ok=True), path.write_bytes(data)))
        return f"{self.base_url}/{key}"


class S3Storage:
    def __init__(self) -> None:
        import boto3  # optional dependency, imported lazily

        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        )
        base = settings.S3_PUBLIC_BASE_URL or f"{settings.S3_ENDPOINT_URL}/{self.bucket}"
        self.public_base = base.rstrip("/")

    async def save(self, key: str, data: bytes, content_type: str) -> str:
        def _put() -> None:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable",
            )

        try:
            await anyio.to_thread.run_sync(_put)
        except Exception as exc:
            logger.exception("s3_upload_failed")
            raise ServiceUnavailable("Falha ao enviar a imagem para o storage.") from exc
        return f"{self.public_base}/{key}"


def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "s3":
        return S3Storage()
    return LocalStorage(settings.MEDIA_ROOT, settings.MEDIA_URL)


def product_image_key(product_id: int) -> str:
    # Content-addressed-ish, immutable keys: a new upload never overwrites a cached URL.
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"products/{product_id}/{stamp}-{uuid4().hex[:12]}.webp"
