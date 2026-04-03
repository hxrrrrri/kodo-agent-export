import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PermissionHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._challenges: dict[str, dict[str, Any]] = {}
        self._events: dict[str, asyncio.Event] = {}
        self._session_policies: dict[str, dict[str, bool]] = {}

    async def create_challenge(
        self,
        *,
        session_id: str,
        tool_name: str,
        input_preview: str,
        tool_description: str,
    ) -> dict[str, Any]:
        challenge_id = str(uuid.uuid4())
        payload: dict[str, Any] = {
            "challenge_id": challenge_id,
            "session_id": session_id,
            "tool_name": tool_name,
            "input_preview": input_preview,
            "tool_description": tool_description,
            "status": "pending",
            "decision": None,
            "remember": False,
            "created_at": _utc_now(),
            "decided_at": None,
        }

        async with self._lock:
            self._challenges[challenge_id] = payload
            self._events[challenge_id] = asyncio.Event()
        return payload

    async def list_pending(self, session_id: str | None = None) -> list[dict[str, Any]]:
        async with self._lock:
            rows = [
                payload
                for payload in self._challenges.values()
                if payload.get("status") == "pending"
                and (session_id is None or str(payload.get("session_id", "")) == session_id)
            ]
        rows.sort(key=lambda row: str(row.get("created_at", "")))
        return rows

    async def set_decision(self, challenge_id: str, *, approve: bool, remember: bool = False) -> dict[str, Any] | None:
        async with self._lock:
            payload = self._challenges.get(challenge_id)
            if payload is None:
                return None

            if payload.get("status") != "pending":
                return payload

            payload["status"] = "approved" if approve else "denied"
            payload["decision"] = bool(approve)
            payload["remember"] = bool(remember)
            payload["decided_at"] = _utc_now()

            if remember:
                session_id = str(payload.get("session_id", "")).strip()
                tool_name = str(payload.get("tool_name", "")).strip()
                if session_id and tool_name:
                    session_rules = self._session_policies.setdefault(session_id, {})
                    session_rules[tool_name] = bool(approve)

            event = self._events.get(challenge_id)

        if event is not None:
            event.set()
        return payload

    async def wait_for_decision(self, challenge_id: str, timeout_seconds: int) -> tuple[bool, bool, str]:
        async with self._lock:
            payload = self._challenges.get(challenge_id)
            if payload is None:
                return False, False, "missing"
            event = self._events.get(challenge_id)

        if event is None:
            # Already decided or unavailable.
            async with self._lock:
                payload = self._challenges.get(challenge_id)
                if payload is None:
                    return False, False, "missing"
                return bool(payload.get("decision")), bool(payload.get("remember")), "decided"

        try:
            await asyncio.wait_for(event.wait(), timeout=max(5, timeout_seconds))
        except asyncio.TimeoutError:
            async with self._lock:
                payload = self._challenges.get(challenge_id)
                if payload is None:
                    return False, False, "missing"
                if payload.get("status") == "pending":
                    payload["status"] = "expired"
                    payload["decision"] = False
                    payload["remember"] = False
                    payload["decided_at"] = _utc_now()
                self._events.pop(challenge_id, None)
            return False, False, "timeout"

        async with self._lock:
            payload = self._challenges.get(challenge_id)
            if payload is None:
                return False, False, "missing"
            self._events.pop(challenge_id, None)
            return bool(payload.get("decision")), bool(payload.get("remember")), "decided"

    async def get_policy(self, session_id: str, tool_name: str) -> bool | None:
        async with self._lock:
            session_rules = self._session_policies.get(session_id, {})
            if tool_name in session_rules:
                return bool(session_rules[tool_name])
            return None


permission_hub = PermissionHub()
