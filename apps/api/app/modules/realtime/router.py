import asyncio
import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.metrics import SSE_CONNECTIONS
from app.core.realtime import ADMIN_CHANNEL, hub, user_channel
from app.modules.identity.dependencies import Principal, get_principal

router = APIRouter(prefix="/events", tags=["realtime"])


@router.get(
    "/stream",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Server-Sent Events"}},
)
async def stream(
    request: Request,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    """Server-Sent Events for the logged-in user (and the admin board for admins).

    Ends when the access token expires so the browser re-authenticates. See docs/adr/0005-sse-em-vez-de-websocket.md.
    """
    # Authentication may have touched the DB. Return that connection to the pool now: a stream
    # can stay open for minutes and must not pin one of the few Postgres connections.
    await session.close()

    channels = [user_channel(principal.id)]
    if principal.is_admin:
        channels.append(ADMIN_CHANNEL)

    async def events():
        SSE_CONNECTIONS.inc()
        try:
            async with hub.subscribe(channels) as queue:
                yield "retry: 3000\n\n"
                yield _format("ready", {"channels": len(channels)})
                while True:
                    if await request.is_disconnected() or time.time() >= principal.token_exp:
                        break
                    try:
                        raw = await asyncio.wait_for(queue.get(), timeout=settings.SSE_HEARTBEAT_SECONDS)
                    except TimeoutError:
                        # Comment line: keeps proxies from closing an idle connection.
                        yield ": keep-alive\n\n"
                        continue
                    message = json.loads(raw)
                    yield _format(message["type"], message["data"])
        finally:
            SSE_CONNECTIONS.dec()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _format(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
