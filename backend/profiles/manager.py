from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

from privacy import feature_enabled
from providers.discovery import discover_local_providers, list_available_models, recommend_model

KODO_DIR = Path.home() / ".kodo"
PROFILES_FILE = KODO_DIR / "profiles.json"
ACTIVE_PROFILE_FILE = KODO_DIR / "active-profile.json"

GOALS = {"coding", "balanced", "latency", "creative"}
PROVIDERS = {
    "anthropic",
    "openai",
    "ollama",
    "gemini",
    "deepseek",
    "groq",
    "atomic-chat",
    "openrouter",
    "github-models",
    "codex",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ProviderProfile:
    provider: str
    model: str
    base_url: str | None
    api_key: str | None
    goal: str
    created_at: str
    name: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ProviderProfile":
        provider = str(payload.get("provider", "")).strip().lower()
        if provider not in PROVIDERS:
            raise ValueError(f"Unsupported profile provider: {provider}")

        goal = str(payload.get("goal", "balanced")).strip().lower()
        if goal not in GOALS:
            goal = "balanced"

        model = str(payload.get("model", "")).strip()
        if not model:
            raise ValueError("Profile model is required")

        created_at = str(payload.get("created_at", "")).strip() or _utc_now()
        name = payload.get("name")
        return cls(
            provider=provider,
            model=model,
            base_url=(str(payload.get("base_url", "")).strip() or None),
            api_key=(str(payload.get("api_key", "")).strip() or None),
            goal=goal,
            created_at=created_at,
            name=(str(name).strip() or None) if name is not None else None,
        )


class ProfileManager:
    def __init__(self) -> None:
        KODO_DIR.mkdir(parents=True, exist_ok=True)
        self.profiles_file: Path = PROFILES_FILE
        self.active_profile_file: Path = ACTIVE_PROFILE_FILE

    async def _read_json(self, path: Path) -> Any:
        if not path.exists():
            return None
        async with aiofiles.open(path, "r", encoding="utf-8") as f:
            raw = await f.read()
        if not raw.strip():
            return None
        return json.loads(raw)

    async def _atomic_write_json(self, path: Path, payload: Any) -> None:
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        serialized = json.dumps(payload, ensure_ascii=True, indent=2)
        async with aiofiles.open(tmp_path, "w", encoding="utf-8") as f:
            await f.write(serialized)
        tmp_path.replace(path)

    async def list_profiles(self) -> list[ProviderProfile]:
        if not feature_enabled("PROFILES"):
            return []

        payload = await self._read_json(self.profiles_file)
        if not isinstance(payload, list):
            return []

        rows: list[ProviderProfile] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            try:
                rows.append(ProviderProfile.from_dict(item))
            except ValueError:
                continue
        return rows

    async def save_profile(self, profile: ProviderProfile) -> None:
        if not feature_enabled("PROFILES"):
            return

        rows = await self.list_profiles()
        profile_name = profile.name or f"{profile.provider}-{profile.goal}"
        profile.name = profile_name

        replaced = False
        updated: list[ProviderProfile] = []
        for row in rows:
            if (row.name or "") == profile_name:
                updated.append(profile)
                replaced = True
            else:
                updated.append(row)

        if not replaced:
            updated.append(profile)

        await self._atomic_write_json(self.profiles_file, [asdict(row) for row in updated])

    async def delete_profile(self, name: str) -> None:
        if not feature_enabled("PROFILES"):
            return

        target = name.strip()
        if not target:
            raise ValueError("Profile name is required")

        rows = await self.list_profiles()
        filtered = [row for row in rows if (row.name or "") != target]
        await self._atomic_write_json(self.profiles_file, [asdict(row) for row in filtered])

        active = await self.get_active_profile()
        if active and (active.name or "") == target:
            if self.active_profile_file.exists():
                self.active_profile_file.unlink()

    async def activate_profile(self, name: str) -> None:
        if not feature_enabled("PROFILES"):
            return

        target = name.strip()
        rows = await self.list_profiles()
        for row in rows:
            if (row.name or "") == target:
                await self._atomic_write_json(self.active_profile_file, asdict(row))
                return

        raise ValueError(f"Profile not found: {name}")

    async def get_active_profile(self) -> ProviderProfile | None:
        if not feature_enabled("PROFILES"):
            return None

        payload = await self._read_json(self.active_profile_file)
        if not isinstance(payload, dict):
            return None
        try:
            return ProviderProfile.from_dict(payload)
        except ValueError:
            return None

    async def auto_select_profile(self, goal: str) -> ProviderProfile:
        if not feature_enabled("PROFILES"):
            raise ValueError("Profile system is disabled")

        normalized_goal = goal.strip().lower()
        if normalized_goal not in GOALS:
            normalized_goal = "balanced"

        local = await discover_local_providers()

        if local.get("ollama"):
            models = await list_available_models("ollama")
            chosen = recommend_model(models, normalized_goal)
            if chosen:
                profile = ProviderProfile(
                    provider="ollama",
                    model=chosen,
                    base_url=None,
                    api_key=None,
                    goal=normalized_goal,
                    created_at=_utc_now(),
                    name=f"auto-ollama-{normalized_goal}",
                )
                await self.save_profile(profile)
                await self.activate_profile(profile.name or "")
                return profile

        if local.get("atomic_chat"):
            models = await list_available_models("atomic_chat")
            chosen = recommend_model(models, normalized_goal)
            if chosen:
                profile = ProviderProfile(
                    provider="atomic-chat",
                    model=chosen,
                    base_url=None,
                    api_key=None,
                    goal=normalized_goal,
                    created_at=_utc_now(),
                    name=f"auto-atomic-{normalized_goal}",
                )
                await self.save_profile(profile)
                await self.activate_profile(profile.name or "")
                return profile

        import os

        cloud_candidates: list[tuple[str, str, str | None]] = [
            ("deepseek", "DEEPSEEK_API_KEY", "deepseek-chat"),
            ("groq", "GROQ_API_KEY", "llama-3.3-70b-versatile"),
            ("openai", "OPENAI_API_KEY", "gpt-4o"),
            ("anthropic", "ANTHROPIC_API_KEY", "claude-sonnet-4-6"),
            ("gemini", "GEMINI_API_KEY", "gemini-2.0-flash"),
            ("openrouter", "OPENROUTER_API_KEY", "anthropic/claude-sonnet-4-6"),
        ]

        for provider, env_key, default_model in cloud_candidates:
            if os.getenv(env_key, "").strip():
                profile = ProviderProfile(
                    provider=provider,
                    model=default_model,
                    base_url=None,
                    api_key=None,
                    goal=normalized_goal,
                    created_at=_utc_now(),
                    name=f"auto-{provider}-{normalized_goal}",
                )
                await self.save_profile(profile)
                await self.activate_profile(profile.name or "")
                return profile

        raise ValueError("No local or cloud providers are available for auto profile selection")


profile_manager = ProfileManager()
