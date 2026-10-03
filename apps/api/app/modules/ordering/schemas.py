from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.pagination import Page
from app.modules.catalog.schemas import Money
from app.modules.ordering.domain import OrderStatus


class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=50)


class OrderCreate(BaseModel):
    delivery_address: str = Field(min_length=5, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=50)

    @field_validator("delivery_address")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    description: str | None = Field(default=None, max_length=255)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: Money
    total_price: Money


class TrackingEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: OrderStatus
    description: str
    created_by_user_id: int | None
    created_at: datetime


class OrderSummary(BaseModel):
    """List representation: items included (selectinload), tracking history omitted."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    status: OrderStatus
    total_amount: Money
    delivery_address: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None = None
    preparing_at: datetime | None = None
    out_for_delivery_at: datetime | None = None
    delivered_at: datetime | None = None
    canceled_at: datetime | None = None
    items: list[OrderItemRead]


class OrderRead(OrderSummary):
    tracking_events: list[TrackingEventRead]


# Module-level (strong) reference to the parametrised model: pydantic caches generic
# parametrisations weakly, and under load the class was being rebuilt per request (seen in py-spy).
OrderSummaryPage = Page[OrderSummary]
