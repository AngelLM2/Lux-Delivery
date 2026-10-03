from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.pagination import Page


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    order_id: int | None
    event_type: str
    message: str
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


class MarkAllResult(BaseModel):
    updated: int


# Module-level (strong) reference to the parametrised model: pydantic caches generic
# parametrisations weakly, and under load the class was being rebuilt per request (seen in py-spy).
NotificationPage = Page[NotificationRead]
