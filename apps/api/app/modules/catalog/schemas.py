from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from app.core.pagination import Page

# Decimals travel as JSON numbers with two decimal places (the frontend formats BRL itself).
Money = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    position: int = Field(default=0, ge=0, le=10_000)

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    position: int | None = Field(default=None, ge=0, le=10_000)


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    description: str = Field(default="", max_length=1000)
    short_description: str = Field(default="", max_length=255)
    is_offer: bool = False
    highlights: bool = False
    is_available: bool = True
    category_id: int | None = None
    image_url: str | None = Field(default=None, max_length=500)


def _validate_image_url(value: str | None) -> str | None:
    # Rendered in <img src>: only web URLs or our own media path (no javascript:, data:, file:).
    if value is None or value.startswith(("https://", "http://", "/media/")):
        return value
    raise ValueError("image_url deve comecar com https://, http:// ou /media/.")


class ProductCreate(ProductBase):
    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("image_url")
    @classmethod
    def _image_url(cls, value: str | None) -> str | None:
        return _validate_image_url(value)


class ProductUpdate(BaseModel):
    """PATCH semantics: only the fields sent are changed (``exclude_unset``)."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    description: str | None = Field(default=None, max_length=1000)
    short_description: str | None = Field(default=None, max_length=255)
    is_offer: bool | None = None
    highlights: bool | None = None
    is_available: bool | None = None
    category_id: int | None = None
    image_url: str | None = Field(default=None, max_length=500)

    @field_validator("image_url")
    @classmethod
    def _image_url(cls, value: str | None) -> str | None:
        return _validate_image_url(value)


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Money
    description: str
    short_description: str
    image_url: str | None
    is_offer: bool
    highlights: bool
    is_available: bool
    category_id: int | None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# Module-level (strong) reference to the parametrised model: pydantic caches generic
# parametrisations weakly, and under load the class was being rebuilt per request (seen in py-spy).
ProductPage = Page[ProductRead]
