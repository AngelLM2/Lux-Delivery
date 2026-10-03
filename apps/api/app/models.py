"""Imports every ORM model so ``Base.metadata`` is complete (Alembic, tests, seed)."""

from app.core.database import Base
from app.core.outbox import OutboxEvent
from app.modules.catalog.models import Category, Product
from app.modules.identity.models import RefreshToken, User, UserRole
from app.modules.notifications.models import Notification
from app.modules.ordering.models import IdempotencyKey, Order, OrderItem, OrderTrackingEvent

__all__ = [
    "Base",
    "Category",
    "IdempotencyKey",
    "Notification",
    "Order",
    "OrderItem",
    "OrderTrackingEvent",
    "OutboxEvent",
    "Product",
    "RefreshToken",
    "User",
    "UserRole",
]
