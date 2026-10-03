"""Consumer group ``notifications``: turns order events into persisted notifications."""

import uuid

from app.core.database import SessionLocal
from app.core.realtime import publish, user_channel
from app.modules.notifications.schemas import NotificationRead
from app.modules.notifications.service import NotificationService

_STATUS_MESSAGES = {
    "created": "Recebemos seu pedido #{id}. Ja ja o restaurante confirma!",
    "confirmed": "Pedido #{id} confirmado pelo restaurante.",
    "preparing": "Pedido #{id} esta sendo preparado.",
    "out_for_delivery": "Pedido #{id} saiu para entrega.",
    "delivered": "Pedido #{id} entregue. Bom apetite!",
    "canceled": "Pedido #{id} foi cancelado.",
}


async def handle(event_id: str, event_type: str, payload: dict) -> None:
    if event_type == "order.created":
        status = "created"
    elif event_type == "order.status_changed":
        status = payload["to"]
    else:
        return

    order_id = int(payload["order_id"])
    customer_id = int(payload["customer_id"])
    async with SessionLocal() as session:
        notification = await NotificationService(session).create_from_event(
            event_id=uuid.UUID(event_id),
            user_id=customer_id,
            order_id=order_id,
            event_type=f"order_{status}",
            message=_STATUS_MESSAGES[status].format(id=order_id),
        )
        await session.commit()

    if notification is not None:  # None means a redelivery we already handled
        await publish(
            user_channel(customer_id),
            "notification.created",
            NotificationRead.model_validate(notification).model_dump(mode="json"),
        )
