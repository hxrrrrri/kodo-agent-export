from __future__ import annotations

import json
from collections import defaultdict

from fastapi import WebSocket


class DesignWebSocketHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, project_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[project_id].add(websocket)

    def disconnect(self, project_id: str, websocket: WebSocket) -> None:
        sockets = self._connections.get(project_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._connections.pop(project_id, None)

    async def publish(self, project_id: str, payload: dict) -> None:
        sockets = list(self._connections.get(project_id, set()))
        dead: list[WebSocket] = []
        for websocket in sockets:
            try:
                await websocket.send_text(json.dumps(payload, ensure_ascii=True))
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(project_id, websocket)


design_ws_hub = DesignWebSocketHub()
