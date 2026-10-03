from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import OrderStatus


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=100)


class OrderCreate(BaseModel):
    delivery_address: str = Field(min_length=5, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=50)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    description: str | None = Field(default=None, max_length=255)


class OrderItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: float
    total_price: float

    model_config = ConfigDict(from_attributes=True)


class TrackingEventRead(BaseModel):
    id: int
    status: OrderStatus
    description: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderRead(BaseModel):
    id: int
    customer_id: int
    status: OrderStatus
    total_amount: float
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
    tracking_events: list[TrackingEventRead]

    model_config = ConfigDict(from_attributes=True)
