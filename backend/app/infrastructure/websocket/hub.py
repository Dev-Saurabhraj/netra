import json
import asyncio
from typing import Set, Dict, Any
from fastapi import WebSocket
from app.core.logging import logger


class WebSocketHub:
    """
    Real-time WebSocket connection manager for broadcasting telemetry updates,
    discovery progress, and topology change events to NOC client browsers.
    """

    def __init__(self):
        self._active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self._active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self._active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self._active_connections)}")

    async def broadcast(self, message_type: str, payload: Dict[str, Any]):
        """
        Broadcast structured JSON payload to all connected clients.
        """
        if not self._active_connections:
            return

        message = json.dumps({"type": message_type, "data": payload})
        disconnected = set()

        for conn in list(self._active_connections):
            try:
                await conn.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send message to websocket client: {e}")
                disconnected.add(conn)

        for conn in disconnected:
            self._active_connections.discard(conn)


ws_hub = WebSocketHub()

