from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, TypeVar

from privacy import build_httpx_async_client, feature_enabled

logger = logging.getLogger(__name__)

ROUTER_STRATEGIES = {"latency", "cost", "balanced", "quality"}

T = TypeVar("T")


@dataclass
class Provider:
    name: str
    ping_url: str
    api_key_env: str
    cost_per_1k_tokens: float
    big_model: str
    small_model: str
    latency_ms: float = 9999.0
    healthy: bool = False
    request_count: int = 0
    error_count: int = 0
    avg_latency_ms: float = 9999.0
    base_url: str = ""
    ping_method: str = "GET"
    ping_headers: dict[str, str] = field(default_factory=dict)

    @property
    def api_key(self) -> str:
        if not self.api_key_env:
            return ""
        return os.getenv(self.api_key_env, "").strip()

    @property
    def is_configured(self) -> bool:
        if self.name in {"ollama", "atomic-chat"}:
            return True
        return bool(self.api_key)

    @property
    def error_rate(self) -> float:
        if self.request_count <= 0:
            return 0.0
        return self.error_count / self.request_count

    def score(self, strategy: str) -> float:
        if not self.healthy or not self.is_configured:
            return float("inf")

        latency = self.avg_latency_ms if self.avg_latency_ms > 0 else self.latency_ms
        latency_score = latency / 1000.0
        cost_score = self.cost_per_1k_tokens * 100.0
        error_penalty = self.error_rate * 500.0

        if strategy == "latency":
            return latency_score + error_penalty
        if strategy == "cost":
            return cost_score + error_penalty
        if strategy == "quality":
            return (self.error_rate * 1000.0) + (latency_score * 0.1)

        return (latency_score * 0.45) + (cost_score * 0.55) + error_penalty


def _env_model(name: str, default: str) -> str:
    value = os.getenv(name, "").strip()
    return value or default


def build_default_providers() -> list[Provider]:
    ollama_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    atomic_base = os.getenv("ATOMIC_CHAT_BASE_URL", "http://127.0.0.1:1337").rstrip("/")

    return [
        Provider(
            name="openai",
            ping_url="https://api.openai.com/v1/models",
            api_key_env="OPENAI_API_KEY",
            cost_per_1k_tokens=0.002,
            big_model=_env_model("BIG_MODEL", "gpt-4o"),
            small_model=_env_model("SMALL_MODEL", "gpt-4o-mini"),
            base_url="https://api.openai.com/v1",
        ),
        Provider(
            name="gemini",
            ping_url="https://generativelanguage.googleapis.com/v1/models",
            api_key_env="GEMINI_API_KEY",
            cost_per_1k_tokens=0.0005,
            big_model=_env_model("BIG_MODEL", "gemini-2.5-pro"),
            small_model=_env_model("SMALL_MODEL", "gemini-2.0-flash"),
            base_url="https://generativelanguage.googleapis.com/v1beta",
            ping_headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", "")},
        ),
        Provider(
            name="ollama",
            ping_url=f"{ollama_base}/api/tags",
            api_key_env="",
            cost_per_1k_tokens=0.0,
            big_model=_env_model("BIG_MODEL", "llama3.1:8b"),
            small_model=_env_model("SMALL_MODEL", "llama3.1:8b"),
            base_url=f"{ollama_base}/v1",
        ),
        Provider(
            name="atomic-chat",
            ping_url=f"{atomic_base}/v1/models",
            api_key_env="",
            cost_per_1k_tokens=0.0,
            big_model=_env_model("BIG_MODEL", "llama3.1:8b"),
            small_model=_env_model("SMALL_MODEL", "llama3.1:8b"),
            base_url=f"{atomic_base}/v1",
        ),
        Provider(
            name="github-models",
            ping_url="https://models.github.ai/inference/models",
            api_key_env="GITHUB_MODELS_TOKEN",
            cost_per_1k_tokens=0.001,
            big_model=_env_model("BIG_MODEL", "openai/gpt-4.1"),
            small_model=_env_model("SMALL_MODEL", "openai/gpt-4.1-mini"),
            base_url="https://models.github.ai/inference",
        ),
        Provider(
            name="codex",
            ping_url="https://api.openai.com/v1/models",
            api_key_env="CODEX_API_KEY",
            cost_per_1k_tokens=0.001,
            big_model=_env_model("BIG_MODEL", "o4-mini"),
            small_model=_env_model("SMALL_MODEL", "gpt-4o-mini"),
            base_url="https://api.openai.com/v1",
        ),
        Provider(
            name="deepseek",
            ping_url="https://api.deepseek.com/v1/models",
            api_key_env="DEEPSEEK_API_KEY",
            cost_per_1k_tokens=0.0001,
            big_model="deepseek-chat",
            small_model="deepseek-chat",
            base_url="https://api.deepseek.com/v1",
        ),
        Provider(
            name="groq",
            ping_url="https://api.groq.com/openai/v1/models",
            api_key_env="GROQ_API_KEY",
            cost_per_1k_tokens=0.00004,
            big_model="llama-3.3-70b-versatile",
            small_model="llama-3.1-8b-instant",
            base_url="https://api.groq.com/openai/v1",
        ),
        Provider(
            name="openrouter",
            ping_url="https://openrouter.ai/api/v1/models",
            api_key_env="OPENROUTER_API_KEY",
            cost_per_1k_tokens=0.001,
            big_model="anthropic/claude-sonnet-4-6",
            small_model="google/gemma-3-4b-it",
            base_url="https://openrouter.ai/api/v1",
        ),
    ]


class SmartRouter:
    def __init__(
        self,
        providers: list[Provider] | None = None,
        strategy: str | None = None,
        fallback_enabled: bool | None = None,
    ) -> None:
        self.providers = providers or build_default_providers()
        configured_strategy = (strategy or os.getenv("ROUTER_STRATEGY", "balanced")).strip().lower()
        self.strategy = configured_strategy if configured_strategy in ROUTER_STRATEGIES else "balanced"

        if fallback_enabled is None:
            fallback_enabled = os.getenv("ROUTER_FALLBACK", "true").strip().lower() in {"1", "true", "yes", "on"}
        self.fallback_enabled = bool(fallback_enabled)

        self._initialized = False
        self._health_task: asyncio.Task[Any] | None = None
        self._init_lock = asyncio.Lock()

    async def initialize(self) -> None:
        async with self._init_lock:
            if self._initialized:
                return
            await self._benchmark_providers()
            self._health_task = asyncio.create_task(self._health_loop())
            self._initialized = True
            logger.info("SmartRouter initialized with strategy=%s", self.strategy)

    async def _ping_provider(self, provider: Provider) -> None:
        if not provider.is_configured:
            provider.healthy = False
            return

        headers = dict(provider.ping_headers)
        if provider.api_key:
            if provider.name == "gemini":
                headers.setdefault("x-goog-api-key", provider.api_key)
            else:
                headers.setdefault("Authorization", f"Bearer {provider.api_key}")

        start = time.perf_counter()
        try:
            async with build_httpx_async_client(timeout=5.0, headers=headers) as client:
                if provider.ping_method.upper() == "POST":
                    response = await client.post(provider.ping_url)
                else:
                    response = await client.get(provider.ping_url)

            elapsed_ms = (time.perf_counter() - start) * 1000.0
            if response.status_code in {200, 400, 401, 403}:
                provider.healthy = True
                provider.latency_ms = elapsed_ms
                if provider.avg_latency_ms <= 0 or provider.avg_latency_ms >= 9999:
                    provider.avg_latency_ms = elapsed_ms
                logger.debug("Provider %s healthy at %.1fms", provider.name, elapsed_ms)
                return

            provider.healthy = False
            logger.warning("Provider %s unhealthy status=%s", provider.name, response.status_code)
        except Exception as exc:
            provider.healthy = False
            logger.warning("Provider %s unreachable: %s", provider.name, exc)

    async def _benchmark_providers(self) -> None:
        await asyncio.gather(*(self._ping_provider(provider) for provider in self.providers), return_exceptions=True)

    async def _health_loop(self) -> None:
        interval = max(10, int(os.getenv("ROUTER_HEALTH_INTERVAL_SECONDS", "60") or 60))
        while True:
            try:
                await asyncio.sleep(interval)
                await self._benchmark_providers()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("SmartRouter health loop error: %s", exc)

    def _is_large_request(self, messages: list[dict[str, Any]]) -> bool:
        total = 0
        for message in messages:
            content = message.get("content", "")
            if isinstance(content, str):
                total += len(content)
            elif isinstance(content, list):
                total += sum(len(str(part)) for part in content)
        return total > 2000

    def _resolve_model(self, provider: Provider, requested_model: str, messages: list[dict[str, Any]]) -> str:
        explicit = requested_model.strip()
        if explicit:
            return explicit
        return provider.big_model if self._is_large_request(messages) else provider.small_model

    def _eligible_providers(self, exclude: set[str]) -> list[Provider]:
        return [
            provider
            for provider in self.providers
            if provider.name not in exclude and provider.healthy and provider.is_configured
        ]

    def _pick_best(self, exclude: set[str]) -> Provider | None:
        candidates = self._eligible_providers(exclude)
        if not candidates:
            return None
        return min(candidates, key=lambda provider: provider.score(self.strategy))

    def _record_success(self, provider: Provider, duration_ms: float) -> None:
        provider.request_count += 1
        provider.latency_ms = duration_ms
        if provider.avg_latency_ms <= 0 or provider.avg_latency_ms >= 9999:
            provider.avg_latency_ms = duration_ms
        else:
            alpha = 0.3
            provider.avg_latency_ms = (alpha * duration_ms) + ((1 - alpha) * provider.avg_latency_ms)

    def _record_error(self, provider: Provider) -> None:
        provider.request_count += 1
        provider.error_count += 1
        if provider.request_count >= 3 and provider.error_rate > 0.7:
            provider.healthy = False

    async def route(
        self,
        messages: list[dict[str, Any]],
        model: str = "",
        stream: bool = False,
        exclude_providers: list[str] | None = None,
        executor: Callable[[Provider, str], Awaitable[T]] | None = None,
    ) -> T | dict[str, Any]:
        if not self._initialized:
            await self.initialize()

        attempted: set[str] = set(exclude_providers or [])
        last_error: Exception | None = None

        while True:
            provider = self._pick_best(attempted)
            if provider is None:
                if last_error:
                    raise last_error
                raise RuntimeError("No healthy providers are available for SmartRouter")

            routed_model = self._resolve_model(provider, model, messages)
            if executor is None:
                return {
                    "provider": provider.name,
                    "model": routed_model,
                    "base_url": provider.base_url,
                    "api_key": provider.api_key,
                    "stream": stream,
                }

            start = time.perf_counter()
            try:
                result = await executor(provider, routed_model)
                self._record_success(provider, (time.perf_counter() - start) * 1000.0)
                return result
            except Exception as exc:
                self._record_error(provider)
                attempted.add(provider.name)
                last_error = exc
                logger.warning("SmartRouter provider %s failed: %s", provider.name, exc)
                if not self.fallback_enabled:
                    raise

    def get_status(self) -> dict[str, Any]:
        return {
            "mode": "smart",
            "strategy": self.strategy,
            "fallback_enabled": self.fallback_enabled,
            "providers": [
                {
                    "provider": provider.name,
                    "healthy": provider.healthy,
                    "configured": provider.is_configured,
                    "latency_ms": round(provider.avg_latency_ms, 2),
                    "errors": provider.error_count,
                    "requests": provider.request_count,
                    "error_rate": round(provider.error_rate, 4),
                    "cost_per_1k": provider.cost_per_1k_tokens,
                    "big_model": provider.big_model,
                    "small_model": provider.small_model,
                    "score": None
                    if (not provider.healthy or not provider.is_configured)
                    else round(provider.score(self.strategy), 6),
                }
                for provider in self.providers
            ],
        }

    def reset_stats(self) -> None:
        for provider in self.providers:
            provider.request_count = 0
            provider.error_count = 0
            provider.avg_latency_ms = provider.latency_ms

    def set_strategy(self, strategy: str) -> str:
        normalized = strategy.strip().lower()
        if normalized not in ROUTER_STRATEGIES:
            raise ValueError(f"Invalid router strategy: {strategy}")
        self.strategy = normalized
        return self.strategy

    async def close(self) -> None:
        if self._health_task:
            self._health_task.cancel()
            with contextlib.suppress(Exception):
                await self._health_task


_ROUTER_SINGLETON: SmartRouter | None = None
_ROUTER_SINGLETON_LOCK = asyncio.Lock()


def smart_router_enabled() -> bool:
    return feature_enabled("SMART_ROUTER") and os.getenv("ROUTER_MODE", "fixed").strip().lower() == "smart"


async def get_smart_router() -> SmartRouter:
    global _ROUTER_SINGLETON

    async with _ROUTER_SINGLETON_LOCK:
        if _ROUTER_SINGLETON is None:
            _ROUTER_SINGLETON = SmartRouter()
        await _ROUTER_SINGLETON.initialize()
        return _ROUTER_SINGLETON
