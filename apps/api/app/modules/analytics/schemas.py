from datetime import date

from pydantic import BaseModel


class StatusCount(BaseModel):
    status: str
    count: int


class DailyPoint(BaseModel):
    day: date
    orders: int
    delivered: int
    revenue: float


class TopProduct(BaseModel):
    product_id: int
    name: str
    quantity: int
    revenue: float


class DurationStats(BaseModel):
    avg: float | None
    p50: float | None
    p90: float | None


class OrdersAnalytics(BaseModel):
    period_start: date
    period_end: date
    timezone: str
    total_orders: int
    delivered_orders: int
    canceled_orders: int
    cancel_rate: float
    revenue: float
    average_ticket: float | None
    minutes_to_confirm: DurationStats
    minutes_to_dispatch: DurationStats
    minutes_to_deliver: DurationStats
    minutes_end_to_end: DurationStats
    status_breakdown: list[StatusCount]
    daily: list[DailyPoint]
    top_products: list[TopProduct]
