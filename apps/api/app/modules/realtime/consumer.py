"""Consumer group ``realtime``: fans order events out to connected browsers.

It reads the same stream as the notifications group but independently (each consumer group
keeps its own offset), so a slow notification insert never delays the live order board.
"""

from app.core.realtime import ADMIN_CHANNEL, publish, user_channel


async def handle(event_id: str, event_type: str, payload: dict) -> None:
    if not event_type.startswith("order."):
        return
    data = {
        "event_id": event_id,
        "order_id": payload["order_id"],
        "status": payload.get("to") or payload.get("status"),
        "previous_status": payload.get("from"),
    }
    await publish(user_channel(int(payload["customer_id"])), "order.updated", data)
    admin_event = "order.created" if event_type == "order.created" else "order.updated"
    await publish(ADMIN_CHANNEL, admin_event, {**data, "total_amount": payload.get("total_amount")})
