"""Opaque keyset cursors: constant cost per page and no duplicates/gaps, unlike OFFSET.

Base64 JSON keeps the cursor opaque, so its shape can change. See docs/adr/0007-paginacao-keyset.md.
"""

import base64
import binascii
import json
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

from app.core.errors import BadRequest

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None


def encode_cursor(values: dict) -> str:
    raw = json.dumps(values, separators=(",", ":"), default=str).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> dict | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        raise BadRequest("Cursor de paginacao invalido.", code="invalid_cursor") from None
    if not isinstance(value, dict):
        raise BadRequest("Cursor de paginacao invalido.", code="invalid_cursor")
    return value


INT32_MAX = 2**31 - 1
INT64_MAX = 2**63 - 1


def _invalid() -> BadRequest:
    return BadRequest("Cursor de paginacao invalido.", code="invalid_cursor")


def cursor_id(cursor: str | None, max_value: int = INT32_MAX) -> int | None:
    """`{"id": n}` cursors. Tampered values become a 400, never a database error (500)."""
    decoded = decode_cursor(cursor)
    if decoded is None:
        return None
    value = decoded.get("id")
    if type(value) is not int or not 0 <= value <= max_value:
        raise _invalid()
    return value


def cursor_created_id(cursor: str | None, max_value: int = INT64_MAX) -> tuple[datetime, int] | None:
    """`{"c": iso-datetime, "i": id}` cursors used by newest-first keyset pagination."""
    decoded = decode_cursor(cursor)
    if decoded is None:
        return None
    created, row_id = decoded.get("c"), decoded.get("i")
    if not isinstance(created, str) or type(row_id) is not int or not 0 <= row_id <= max_value:
        raise _invalid()
    try:
        moment = datetime.fromisoformat(created)
    except ValueError:
        raise _invalid() from None
    if moment.tzinfo is None:
        raise _invalid()
    return moment, row_id
