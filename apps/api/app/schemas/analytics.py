from pydantic import BaseModel


class OrderStatusCount(BaseModel):
    status: str
    count: int


class OrdersAnalyticsRead(BaseModel):
    period_start: str
    period_end: str
    total_orders: int
    delivered_orders: int
    canceled_orders: int
    avg_minutes_to_confirm: float | None
    avg_minutes_to_dispatch: float | None   
    avg_minutes_to_deliver: float | None
    status_breakdown: list[OrderStatusCount]
