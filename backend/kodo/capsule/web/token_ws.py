from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect

from ..token_tracker import token_tracker

logger = logging.getLogger(__name__)


async def capsule_usage_websocket(websocket: WebSocket, session_id: str | None = None) -> None:
    await websocket.accept()
    queue = token_tracker.subscribe()
    try:
        if session_id:
            state = token_tracker.get_state(session_id)
            if state is not None:
                await websocket.send_json(state.to_payload())
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "PING"})
                continue
            if session_id and event.session_id != session_id:
                continue
            await websocket.send_json(
                {
                    "type": "TOKEN_UPDATE",
                    "session_id": event.session_id,
                    "agent_id": event.agent_id,
                    "provider": event.provider,
                    "model": event.model,
                    "input_tokens": event.input_tokens,
                    "output_tokens": event.output_tokens,
                    "total_input": event.cumulative_input,
                    "total_output": event.cumulative_output,
                    "context_pct": event.context_pct,
                    "rate_limit_pct": event.rate_limit_pct,
                    "alert_level": event.alert_level,
                    "alert_reason": event.alert_reason,
                    "timestamp": event.timestamp,
                }
            )
    except WebSocketDisconnect:
        logger.debug("Capsule usage websocket disconnected")
    except Exception as exc:
        logger.debug("Capsule usage websocket closed: %s", exc)
    finally:
        token_tracker.unsubscribe(queue)

