from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .storage import capsule_store
from .types import TokenData, TokenEvent, utc_now_iso

logger = logging.getLogger(__name__)


CONTEXT_WINDOWS: dict[str, int] = {
    "claude-opus-4-20250514": 200_000,
    "claude-opus-4-5": 200_000,
    "claude-sonnet-4-6": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-haiku-4-5": 200_000,
    "claude-3-5-sonnet-20241022": 200_000,
    "claude-3-5-haiku-20241022": 200_000,
    "claude-3-opus-20240229": 200_000,
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "gpt-4-turbo": 128_000,
    "o1": 200_000,
    "o1-mini": 128_000,
    "o3": 200_000,
    "o3-mini": 200_000,
    "o4-mini": 200_000,
    "gemini-2.5-pro": 1_048_576,
    "gemini-2.5-flash": 1_048_576,
    "gemini-2.0-flash": 1_048_576,
    "gemini-1.5-pro": 2_097_152,
    "gemini-1.5-flash": 1_048_576,
    "llama3.1:8b": 131_072,
    "llama3.1:70b": 131_072,
    "llama3.3:70b": 131_072,
    "mistral:7b": 32_768,
    "mistral-nemo:12b": 128_000,
    "codestral:22b": 32_768,
    "phi4:14b": 131_072,
    "phi3:mini": 128_000,
    "gemma3:27b": 131_072,
    "deepseek-r1:14b": 131_072,
    "qwen2.5:72b": 131_072,
}


def _headers_dict(headers: dict[str, Any] | None) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in dict(headers or {}).items():
        result[str(key).lower()] = str(value)
    return result


def _int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return max(0, int(value))
    except Exception:
        return default


def _float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        parsed = float(value)
        if parsed < 0:
            return None
        return parsed
    except Exception:
        return None


def _parse_reset(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    now = datetime.now(timezone.utc)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        logger.debug("Token reset value is not ISO8601: %s", raw)
    match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?", raw)
    if match:
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = float(match.group(3) or 0)
        return now + timedelta(hours=hours, minutes=minutes, seconds=seconds)
    try:
        return now + timedelta(seconds=float(raw))
    except Exception:
        return None


def context_window_for_model(model: str, provider: str | None = None) -> int:
    raw = str(model or "").strip()
    if not raw:
        return 200_000 if provider == "anthropic" else 128_000
    candidates = [raw, raw.split("/")[-1], raw.split(":latest")[0]]
    for candidate in candidates:
        if candidate in CONTEXT_WINDOWS:
            return CONTEXT_WINDOWS[candidate]
    lower = raw.lower()
    if "claude" in lower:
        return 200_000
    if "gemini-1.5-pro" in lower:
        return 2_097_152
    if "gemini" in lower:
        return 1_048_576
    if any(lower.startswith(prefix) for prefix in ("gpt-", "o1", "o3", "o4")):
        return 128_000 if "mini" in lower or "4o" in lower else 200_000
    if "llama" in lower or "qwen" in lower or "phi" in lower or "gemma" in lower:
        return 131_072
    return 128_000


@dataclass
class TokenTrackerState:
    session_id: str
    agent_id: str | None
    provider: str
    model: str
    context_window: int
    total_input: int = 0
    total_output: int = 0
    rate_limit_tokens_total: int | None = None
    rate_limit_tokens_remaining: int | None = None
    rate_limit_reset_at: datetime | None = None

    @property
    def context_pct(self) -> float:
        if self.context_window <= 0:
            return 0.0
        return min(100.0, ((self.total_input + self.total_output) / self.context_window) * 100)

    @property
    def rate_limit_pct(self) -> float | None:
        if self.rate_limit_tokens_total and self.rate_limit_tokens_remaining is not None:
            used = max(0, self.rate_limit_tokens_total - self.rate_limit_tokens_remaining)
            return min(100.0, (used / self.rate_limit_tokens_total) * 100)
        return None

    @property
    def capsule_alert_level(self) -> str:
        worst = max(self.context_pct, self.rate_limit_pct or 0)
        if worst >= 95:
            return "critical"
        if worst >= 90:
            return "pulsating"
        if worst >= 75:
            return "warning"
        return "idle"

    @property
    def alert_reason(self) -> str:
        context = self.context_pct
        rate = self.rate_limit_pct
        if context >= 95 and rate is not None and rate >= 90:
            return f"CRITICAL: Context at {context:.1f}% and rate limit at {rate:.1f}%"
        if context >= 95:
            return f"CRITICAL: Context window {context:.1f}% full - capture now"
        if rate is not None and rate >= 95:
            reset = self._reset_label()
            suffix = f" - resets in {reset}" if reset else ""
            return f"CRITICAL: Rate limit {rate:.1f}% used{suffix}"
        if context >= 90:
            return f"Context window {context:.1f}% full - capture now before losing history"
        if rate is not None and rate >= 90:
            reset = self._reset_label()
            suffix = f" - resets in {reset}" if reset else ""
            return f"Rate limit {rate:.1f}% used{suffix}"
        if context >= 75:
            return f"Context window {context:.1f}% full"
        if rate is not None and rate >= 75:
            return f"Rate limit {rate:.1f}% used"
        return "Capsule monitoring idle"

    def _reset_label(self) -> str:
        if self.rate_limit_reset_at is None:
            return ""
        now = datetime.now(timezone.utc)
        target = self.rate_limit_reset_at
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        seconds = max(0, int((target - now).total_seconds()))
        minutes, sec = divmod(seconds, 60)
        if minutes:
            return f"{minutes}m {sec}s"
        return f"{sec}s"

    def to_payload(self) -> dict[str, Any]:
        return {
            "type": "TOKEN_UPDATE",
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": self.provider,
            "model": self.model,
            "context_window": self.context_window,
            "total_input": self.total_input,
            "total_output": self.total_output,
            "context_pct": self.context_pct,
            "rate_limit_pct": self.rate_limit_pct,
            "alert_level": self.capsule_alert_level,
            "alert_reason": self.alert_reason,
        }


class AnthropicTokenAdapter:
    def extract_from_response(self, response_body: dict[str, Any], headers: dict[str, Any]) -> TokenData:
        hdr = _headers_dict(headers)
        usage = response_body.get("usage", {}) if isinstance(response_body.get("usage"), dict) else response_body
        input_tokens = _int(usage.get("input_tokens"))
        output_tokens = _int(usage.get("output_tokens"))
        return TokenData(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            rate_limit_tokens_total=_int(hdr.get("anthropic-ratelimit-input-tokens-limit"), 0) or None,
            rate_limit_tokens_remaining=_int(hdr.get("anthropic-ratelimit-input-tokens-remaining"), 0) or None,
            rate_limit_reset_at=_parse_reset(hdr.get("anthropic-ratelimit-input-tokens-reset")),
            rate_limit_requests_total=_int(hdr.get("anthropic-ratelimit-requests-limit"), 0) or None,
            rate_limit_requests_remaining=_int(hdr.get("anthropic-ratelimit-requests-remaining"), 0) or None,
            raw={"headers": hdr, "usage": usage},
        )

    async def count_tokens_preemptively(self, client: Any, model: str, messages: list[Any], system: str = "") -> int:
        try:
            kwargs: dict[str, Any] = {"model": model, "messages": messages}
            if system:
                kwargs["system"] = system
            result = await client.messages.count_tokens(**kwargs)
            return _int(getattr(result, "input_tokens", 0))
        except Exception as exc:
            logger.debug("Anthropic count_tokens failed: %s", exc)
            return 0


class OpenAITokenAdapter:
    def extract_from_response(self, response_body: dict[str, Any], headers: dict[str, Any]) -> TokenData:
        hdr = _headers_dict(headers)
        usage = response_body.get("usage", {}) if isinstance(response_body.get("usage"), dict) else response_body
        input_tokens = _int(usage.get("prompt_tokens", usage.get("input_tokens")))
        output_tokens = _int(usage.get("completion_tokens", usage.get("output_tokens")))
        return TokenData(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=_int(usage.get("total_tokens"), input_tokens + output_tokens),
            rate_limit_tokens_total=_int(hdr.get("x-ratelimit-limit-tokens"), 0) or None,
            rate_limit_tokens_remaining=_int(hdr.get("x-ratelimit-remaining-tokens"), 0) or None,
            rate_limit_reset_at=_parse_reset(hdr.get("x-ratelimit-reset-tokens")),
            rate_limit_requests_total=_int(hdr.get("x-ratelimit-limit-requests"), 0) or None,
            rate_limit_requests_remaining=_int(hdr.get("x-ratelimit-remaining-requests"), 0) or None,
            raw={"headers": hdr, "usage": usage},
        )


class GeminiTokenAdapter:
    def extract_from_response(self, response_body: dict[str, Any], headers: dict[str, Any]) -> TokenData:
        usage = response_body.get("usageMetadata", {}) if isinstance(response_body.get("usageMetadata"), dict) else response_body
        input_tokens = _int(usage.get("promptTokenCount", usage.get("input_tokens")))
        output_tokens = _int(usage.get("candidatesTokenCount", usage.get("output_tokens")))
        return TokenData(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=_int(usage.get("totalTokenCount"), input_tokens + output_tokens),
            raw={"usage": usage},
        )

    async def count_tokens_preemptively(self, client: Any, model: str, contents: Any) -> int:
        try:
            result = await client.models.count_tokens(model=model, contents=contents)
            return _int(getattr(result, "total_tokens", 0))
        except Exception as exc:
            logger.debug("Gemini count_tokens failed: %s", exc)
            return 0


class OllamaTokenAdapter:
    def __init__(self) -> None:
        self._context_cache: dict[tuple[str, str], int] = {}

    def extract_from_response(self, response_body: dict[str, Any], headers: dict[str, Any]) -> TokenData:
        input_tokens = _int(response_body.get("prompt_eval_count", response_body.get("input_tokens")))
        output_tokens = _int(response_body.get("eval_count", response_body.get("output_tokens")))
        return TokenData(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            raw={
                "prompt_eval_duration": response_body.get("prompt_eval_duration"),
                "eval_duration": response_body.get("eval_duration"),
            },
        )

    async def get_model_context_window(self, base_url: str, model: str) -> int:
        key = (base_url.rstrip("/"), model)
        if key in self._context_cache:
            return self._context_cache[key]
        default = context_window_for_model(model, "ollama")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.post(f"{base_url.rstrip('/')}/api/show", json={"model": model})
                response.raise_for_status()
                payload = response.json()
            model_info = payload.get("model_info", {}) if isinstance(payload, dict) else {}
            context = _int(model_info.get("llama.context_length"), 0)
            if context <= 0:
                params = str(payload.get("parameters", ""))
                match = re.search(r"\bnum_ctx\s+(\d+)", params)
                if match:
                    context = _int(match.group(1), 0)
            self._context_cache[key] = context or default
            return self._context_cache[key]
        except Exception as exc:
            logger.debug("Ollama context lookup failed: %s", exc)
            self._context_cache[key] = default
            return default


class OpenRouterTokenAdapter(OpenAITokenAdapter):
    def extract_from_response(self, response_body: dict[str, Any], headers: dict[str, Any]) -> TokenData:
        data = super().extract_from_response(response_body, headers)
        data.generation_id = str(response_body.get("id") or "").strip() or None
        return data

    async def hydrate_generation(self, api_key: str, generation_id: str) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    "https://openrouter.ai/api/v1/generation",
                    params={"id": generation_id},
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                response.raise_for_status()
                return response.json()
        except Exception as exc:
            logger.debug("OpenRouter generation hydration failed: %s", exc)
            return None


class TokenTracker:
    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[TokenEvent]] = []
        self._states: dict[str, TokenTrackerState] = {}
        self._lock = asyncio.Lock()
        self._adapters = {
            "anthropic": AnthropicTokenAdapter(),
            "openai": OpenAITokenAdapter(),
            "gemini": GeminiTokenAdapter(),
            "ollama": OllamaTokenAdapter(),
            "openrouter": OpenRouterTokenAdapter(),
        }

    def subscribe(self) -> asyncio.Queue[TokenEvent]:
        q: asyncio.Queue[TokenEvent] = asyncio.Queue(maxsize=50)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, queue: asyncio.Queue[TokenEvent]) -> None:
        if queue not in self._subscribers:
            return
        try:
            self._subscribers.remove(queue)
        except ValueError:
            logger.debug("Capsule token subscriber was already removed")

    def get_state(self, session_id: str) -> TokenTrackerState | None:
        return self._states.get(session_id)

    async def _broadcast(self, event: TokenEvent) -> None:
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                continue

    def _adapter_for_provider(self, provider: str):
        normalized = str(provider or "unknown").strip().lower()
        if normalized in {"deepseek", "groq", "github-models", "codex", "atomic-chat"}:
            return self._adapters["openai"]
        if normalized == "smart":
            return self._adapters["openai"]
        return self._adapters.get(normalized, self._adapters["openai"])

    async def record_response(
        self,
        provider: str,
        response_body: dict[str, Any],
        response_headers: dict[str, Any],
        session_id: str,
        agent_id: str | None = None,
    ) -> TokenTrackerState:
        normalized_provider = str(provider or "unknown").strip().lower() or "unknown"
        model = str(
            response_body.get("model")
            or response_body.get("model_used")
            or response_body.get("model_name")
            or "unknown"
        ).strip() or "unknown"
        try:
            adapter = self._adapter_for_provider(normalized_provider)
            data = adapter.extract_from_response(response_body, response_headers)
            async with self._lock:
                state = self._states.get(session_id)
                if state is None:
                    state = TokenTrackerState(
                        session_id=session_id,
                        agent_id=agent_id,
                        provider=normalized_provider,
                        model=model,
                        context_window=context_window_for_model(model, normalized_provider),
                    )
                    self._states[session_id] = state
                state.provider = normalized_provider
                state.model = model
                state.agent_id = agent_id or state.agent_id
                state.context_window = context_window_for_model(model, normalized_provider)
                state.total_input += data.input_tokens
                state.total_output += data.output_tokens
                if data.rate_limit_tokens_total is not None:
                    state.rate_limit_tokens_total = data.rate_limit_tokens_total
                if data.rate_limit_tokens_remaining is not None:
                    state.rate_limit_tokens_remaining = data.rate_limit_tokens_remaining
                if data.rate_limit_reset_at is not None:
                    state.rate_limit_reset_at = data.rate_limit_reset_at

                event = TokenEvent(
                    session_id=session_id,
                    agent_id=state.agent_id,
                    provider=state.provider,
                    model=state.model,
                    input_tokens=data.input_tokens,
                    output_tokens=data.output_tokens,
                    cumulative_input=state.total_input,
                    cumulative_output=state.total_output,
                    context_pct=state.context_pct,
                    rate_limit_pct=state.rate_limit_pct,
                    timestamp=utc_now_iso(),
                    alert_level=state.capsule_alert_level,
                    alert_reason=state.alert_reason,
                )
            await capsule_store.log_token_event(event)
            await self._broadcast(event)
            return state
        except Exception as exc:
            logger.warning("Capsule token tracking failed: %s", exc)
            state = self._states.get(session_id)
            if state is None:
                state = TokenTrackerState(
                    session_id=session_id,
                    agent_id=agent_id,
                    provider=normalized_provider,
                    model=model,
                    context_window=context_window_for_model(model, normalized_provider),
                )
                self._states[session_id] = state
            return state


token_tracker = TokenTracker()
