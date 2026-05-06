from __future__ import annotations

from datetime import datetime
from typing import Any

from .capsule_manager import capsule_manager
from .tools.inject import format_capsule_context


class AgentCapsuleMixin:
    """
    Mixin for agent classes. It expects the target class to expose common
    attributes used by this project: session_id, agent_id, history/messages,
    and an optional pending/system context field.
    """

    async def capsule_save_context(self, tag: str | None = None) -> str:
        try:
            session_id = str(getattr(self, "session_id", "")).strip()
            if not session_id:
                raise ValueError("agent has no session_id")
            result = await capsule_manager.capture_session(
                session_id,
                tag=tag,
                agent_id=str(getattr(self, "agent_id", "") or "") or None,
                conversation_history=getattr(self, "history", None) or getattr(self, "messages", None),
            )
            if not result.success:
                raise RuntimeError(result.message)
            capsule = result.data.get("capsule", {})
            return str(capsule.get("id", ""))
        except Exception as exc:
            raise RuntimeError(f"Agent capsule save failed: {exc}") from exc

    async def capsule_inject(self, capsule_id: str) -> None:
        try:
            result = await capsule_manager.inject_capsule(capsule_id)
            if not result.success:
                raise RuntimeError(result.message)
            injected = str(result.data.get("injected_message", ""))
            existing = str(getattr(self, "_capsule_pending_context", "") or "")
            setattr(self, "_capsule_pending_context", f"{existing}\n\n{injected}".strip())
        except Exception as exc:
            raise RuntimeError(f"Agent capsule inject failed: {exc}") from exc

    async def capsule_auto_capture_if_needed(self) -> bool:
        try:
            session_id = str(getattr(self, "session_id", "")).strip()
            if not session_id:
                return False
            state = capsule_manager.token_tracker.get_state(session_id)
            if state is None or state.context_pct < 85:
                return False
            last_pct = float(getattr(self, "_last_auto_capture_at_pct", 0) or 0)
            if last_pct and abs(state.context_pct - last_pct) < 5:
                return False
            agent_id = str(getattr(self, "agent_id", "agent") or "agent")
            await self.capsule_save_context(tag=f"auto-{agent_id}-{datetime.now():%H%M}")
            setattr(self, "_last_auto_capture_at_pct", state.context_pct)
            return True
        except Exception:
            return False

    async def capsule_bridge_to_agent(self, target_agent: Any, capsule_id: str | None = None) -> None:
        try:
            target_inject = getattr(target_agent, "capsule_inject", None)
            if capsule_id is None:
                capsule_id = await self.capsule_save_context(tag=f"handoff-{datetime.now():%H%M}")
            if callable(target_inject):
                await target_inject(capsule_id)
                return
            result = await capsule_manager.inject_capsule(capsule_id)
            if not result.success:
                raise RuntimeError(result.message)
            existing = str(getattr(target_agent, "_capsule_pending_context", "") or "")
            setattr(target_agent, "_capsule_pending_context", f"{existing}\n\n{result.data.get('injected_message', '')}".strip())
        except Exception as exc:
            raise RuntimeError(f"Agent capsule bridge failed: {exc}") from exc


class CapsuleOrchestrationManager:
    def __init__(self) -> None:
        self.active_agents: dict[str, Any] = {}
        self.project_capsule_id: str | None = None

    def register_agent(self, agent_id: str, agent: Any) -> None:
        key = str(agent_id or "").strip()
        if key:
            self.active_agents[key] = agent

    def unregister_agent(self, agent_id: str) -> None:
        self.active_agents.pop(str(agent_id or "").strip(), None)

    async def set_project_capsule(self, capsule_id: str) -> None:
        if await capsule_manager.store.get_capsule(capsule_id) is None:
            raise ValueError(f"Capsule not found: {capsule_id}")
        self.project_capsule_id = capsule_id

    async def inject_project_capsule(self, agent: Any) -> None:
        if not self.project_capsule_id:
            return
        method = getattr(agent, "capsule_inject", None)
        if callable(method):
            await method(self.project_capsule_id)
            return
        capsule = await capsule_manager.store.get_capsule(self.project_capsule_id)
        if capsule is not None:
            existing = str(getattr(agent, "_capsule_pending_context", "") or "")
            setattr(agent, "_capsule_pending_context", f"{existing}\n\n{format_capsule_context(capsule)}".strip())

    async def inject_shared_capsule(self, capsule_id: str) -> int:
        count = 0
        for agent in list(self.active_agents.values()):
            method = getattr(agent, "capsule_inject", None)
            if callable(method):
                await method(capsule_id)
                count += 1
        return count

    def near_limit_agents(self, threshold: float = 85.0) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for agent_id, agent in self.active_agents.items():
            session_id = str(getattr(agent, "session_id", "") or "")
            state = capsule_manager.token_tracker.get_state(session_id)
            if state and state.context_pct >= threshold:
                rows.append({"agent_id": agent_id, "session_id": session_id, **state.to_payload()})
        return rows


capsule_orchestration_manager = CapsuleOrchestrationManager()


