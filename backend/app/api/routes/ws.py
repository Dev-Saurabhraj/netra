import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.infrastructure.websocket.hub import ws_hub
from app.core.security import decode_access_token
from app.core.logging import logger

router = APIRouter(tags=["Real-time Stream"])


@router.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket endpoint streaming live network events, discovery progress, and topology mutations.
    """
    # Optional token verification if token query parameter provided
    if token:
        payload = decode_access_token(token)
        if not payload:
            await websocket.close(code=1008)
            return

    await ws_hub.connect(websocket)
    try:
        while True:
            # Keep socket alive and handle client heartbeat/ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"type": "PONG"}')
    except WebSocketDisconnect:
        ws_hub.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket session terminated: {e}")
        ws_hub.disconnect(websocket)

