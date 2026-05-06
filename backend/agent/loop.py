from __future__ import annotations

import asyncio
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, AsyncGenerator

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from agent.modes import normalize_mode
from agent.permissions import get_permission_checker
from agent.prompt_builder import build_system_prompt
from caveman import get_default_mode as get_default_caveman_mode
from caveman import normalize_mode as normalize_caveman_mode
from memory.manager import memory_manager
from privacy import feature_enabled
from profiles.manager import ProviderProfile, profile_manager
from providers.gemini_provider import gemini_chat
from providers.smart_router import SmartRouter, get_smart_router, smart_router_enabled
from tools import ALL_TOOLS, TOOL_MAP, ToolResult
from tools.path_guard import project_dir_context

DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
OPENAI_MODEL_PREFIXES = ("gpt-", "o1", "o3", "o4")
ANTHROPIC_MODEL_PREFIXES = ("claude",)
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "8192"))
NONE_LIKE_STRINGS = {"none", "null", "undefined"}
LOCAL_PROVIDER_NAMES = {"ollama", "atomic-chat"}


def _normalize_model_name(value: Any) -> str:
    if value is None:
        return ""
    text = value.strip() if isinstance(value, str) else str(value).strip()
    if text.lower() in NONE_LIKE_STRINGS:
        return ""
    return text


def _env_int(name: str, default: int, minimum: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        value = default
    return max(minimum, value)


MAX_CONTEXT_MESSAGES = _env_int("MAX_CONTEXT_MESSAGES", 50, 1)
ENABLE_PROMPT_CACHE = os.getenv("KODO_ENABLE_PROMPT_CACHE", "0").strip().lower() in {"1", "true", "yes", "on"}
N_CACHE_MESSAGES = _env_int("N_CACHE_MESSAGES", 4, 1)
MAX_ANTHROPIC_CACHE_BLOCKS = 4


def _streaming_tools_enabled() -> bool:
    return feature_enabled("STREAMING_TOOLS")


@dataclass
class RuntimeConfig:
    provider: str
    model: str
    api_key: str
    base_url: str | None = None


def build_openai_tools() -> list[dict[str, Any]]:
    openai_tools: list[dict[str, Any]] = []
    for tool in ALL_TOOLS:
        openai_tools.append(
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            }
        )
    return openai_tools


def build_anthropic_tools() -> list[dict[str, Any]]:
    return [tool.to_anthropic_schema() for tool in ALL_TOOLS]


OPENAI_TOOLS = build_openai_tools()
ANTHROPIC_TOOLS = build_anthropic_tools()


def _resolve_provider_config(model_override: str | None = None) -> RuntimeConfig:
    configured_model = _normalize_model_name(model_override or os.getenv("MODEL", ""))

    def _normalize_provider(value: str) -> str:
        normalized = value.strip().lower().replace("_", "-")
        if normalized == "atomicchat":
            return "atomic-chat"
        return normalized

    default_model_map = {
        "anthropic": DEFAULT_ANTHROPIC_MODEL,
        "openai": DEFAULT_OPENAI_MODEL,
        "gemini": os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash",
        "deepseek": "deepseek-chat",
        "groq": "llama-3.3-70b-versatile",
        "openrouter": "anthropic/claude-sonnet-4-6",
        "github-models": "gpt-4o",
        "codex": "gpt-4o",
        "ollama": "llama3",
        "atomic-chat": "default",
    }

    key_env_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "groq": "GROQ_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "github-models": "GITHUB_MODELS_TOKEN",
        "codex": "CODEX_API_KEY",
    }

    base_url_map = {
        "anthropic": os.getenv("ANTHROPIC_BASE_URL", DEFAULT_ANTHROPIC_BASE_URL).strip() or DEFAULT_ANTHROPIC_BASE_URL,
        "openai": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip() or "https://api.openai.com/v1",
        "gemini": os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").strip()
        or "https://generativelanguage.googleapis.com/v1beta",
        "deepseek": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").strip() or "https://api.deepseek.com/v1",
        "groq": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip() or "https://api.groq.com/openai/v1",
        "openrouter": os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip()
        or "https://openrouter.ai/api/v1",
        "github-models": os.getenv("GITHUB_MODELS_BASE_URL", "https://models.github.ai/inference").strip()
        or "https://models.github.ai/inference",
        "codex": os.getenv("CODEX_BASE_URL", "https://api.openai.com/v1").strip() or "https://api.openai.com/v1",
        "ollama": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/") + "/v1",
        "atomic-chat": os.getenv("ATOMIC_CHAT_BASE_URL", "http://127.0.0.1:1337").rstrip("/") + "/v1",
    }

    provider_order = [
        "anthropic",
        "openai",
        "gemini",
        "deepseek",
        "groq",
        "openrouter",
        "github-models",
        "codex",
        "ollama",
        "atomic-chat",
    ]

    requested_provider = _normalize_provider(os.getenv("PRIMARY_PROVIDER", "anthropic"))
    if requested_provider not in provider_order:
        requested_provider = "anthropic"

    candidates: list[str] = [requested_provider]
    for provider_name in provider_order:
        if provider_name != requested_provider:
            candidates.append(provider_name)

    for provider_name in candidates:
        if provider_name in {"ollama", "atomic-chat"}:
            if requested_provider != provider_name:
                continue
            model = configured_model or default_model_map.get(provider_name, "")
            return RuntimeConfig(
                provider=provider_name,
                model=model,
                api_key="local",
                base_url=base_url_map.get(provider_name),
            )

        if provider_name == "gemini":
            gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
            if not gemini_key:
                continue
            model = configured_model or default_model_map.get(provider_name, "")
            return RuntimeConfig(
                provider="gemini",
                model=model,
                api_key=gemini_key,
                base_url=base_url_map.get("gemini"),
            )

        key_env = key_env_map.get(provider_name, "")
        api_key = os.getenv(key_env, "").strip() if key_env else ""
        if not api_key:
            continue

        model = configured_model or default_model_map.get(provider_name, "")
        return RuntimeConfig(
            provider=provider_name,
            model=model,
            api_key=api_key,
            base_url=base_url_map.get(provider_name),
        )

    raise ValueError(
        "No configured provider found. Add at least one provider credential or local provider base URL in backend/.env."
    )


def _profile_env_key(provider: str) -> str:
    mapping = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "groq": "GROQ_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "github-models": "GITHUB_MODELS_TOKEN",
        "codex": "CODEX_API_KEY",
    }
    return mapping.get(provider, "")


def _profile_default_base_url(provider: str) -> str | None:
    defaults = {
        "openai": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        "anthropic": os.getenv("ANTHROPIC_BASE_URL", DEFAULT_ANTHROPIC_BASE_URL),
        "deepseek": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        "groq": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        "openrouter": os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        "github-models": os.getenv("GITHUB_MODELS_BASE_URL", "https://models.github.ai/inference"),
        "codex": os.getenv("CODEX_BASE_URL", "https://api.openai.com/v1"),
        "ollama": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/") + "/v1",
        "atomic-chat": os.getenv("ATOMIC_CHAT_BASE_URL", "http://127.0.0.1:1337").rstrip("/") + "/v1",
        "gemini": "https://generativelanguage.googleapis.com/v1beta",
    }
    value = defaults.get(provider, "")
    return value.strip() or None


def _has_env_overrides() -> bool:
    keys = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "DEEPSEEK_API_KEY",
        "GROQ_API_KEY",
        "OPENROUTER_API_KEY",
        "GITHUB_MODELS_TOKEN",
        "CODEX_API_KEY",
        "MODEL",
        "PRIMARY_PROVIDER",
    ]
    return any(os.getenv(key, "").strip() for key in keys)


def _runtime_from_profile(profile: ProviderProfile, model_override: str | None = None) -> RuntimeConfig:
    provider = profile.provider
    model = _normalize_model_name(model_override or profile.model)
    if not model:
        raise ValueError("Active profile has no model")

    api_key = _normalize_model_name(profile.api_key)
    env_key = _profile_env_key(provider)
    if not api_key and env_key:
        api_key = os.getenv(env_key, "").strip()

    if provider not in {"ollama", "atomic-chat"} and not api_key and provider != "gemini":
        raise ValueError(f"Active profile '{profile.name}' requires API key for provider {provider}")

    base_url = _normalize_model_name(profile.base_url)
    if not base_url:
        base_url = _profile_default_base_url(provider) or ""

    if provider in {"ollama", "atomic-chat"}:
        # AsyncOpenAI expects OpenAI-compatible endpoints under /v1.
        if not base_url.rstrip("/").endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"

    return RuntimeConfig(
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=(base_url or None),
    )


def _truncate_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(history) <= MAX_CONTEXT_MESSAGES:
        return list(history)
    return list(history[-MAX_CONTEXT_MESSAGES:])


def _normalize_content_blocks(content: Any) -> list[dict[str, Any]]:
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []

    if not isinstance(content, list):
        if content is None:
            return []
        return [{"type": "text", "text": str(content)}]

    blocks: list[dict[str, Any]] = []
    for item in content:
        if not isinstance(item, dict):
            continue

        block_type = str(item.get("type", "")).lower().strip()
        if block_type == "text":
            text = item.get("text")
            if isinstance(text, str):
                blocks.append({"type": "text", "text": text})
            continue

        if block_type != "image":
            continue

        source = item.get("source", {})
        if not isinstance(source, dict):
            continue

        source_type = str(source.get("type", "")).lower().strip()
        media_type = str(source.get("media_type") or source.get("mime_type") or "image/png").strip()
        data = source.get("data")
        url = source.get("url")

        if source_type == "base64" and isinstance(data, str) and data.strip():
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data.strip(),
                    },
                }
            )
            continue

        if source_type == "url" and isinstance(url, str) and url.strip():
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": url.strip(),
                    },
                }
            )

    return blocks


def _text_from_content(content: Any) -> str:
    blocks = _normalize_content_blocks(content)
    parts: list[str] = []
    for block in blocks:
        if block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return "\n".join(parts).strip()


def _infer_local_forced_tool_call(
    user_message: str | list[dict[str, Any]],
    provider: str,
    project_dir: str | None,
) -> dict[str, Any] | None:
    """
    Build a deterministic safe tool call for local providers when user intent is
    an obvious filesystem listing operation.
    """
    if provider not in LOCAL_PROVIDER_NAMES:
        return None

    raw_prompt = _text_from_content(user_message)
    # Design Studio and some chat surfaces prepend rich context blocks before
    # the latest user ask. Evaluate intent from the latest segment so context
    # phrases like "File names:" do not trigger forced filesystem listings.
    segments = [chunk.strip() for chunk in re.split(r"\n{2,}", raw_prompt) if chunk.strip()]
    prompt_source = segments[-1] if segments else raw_prompt
    prompt = " ".join(prompt_source.lower().split())
    if not prompt:
        return None

    def _contains_phrase(text: str) -> bool:
        words = [part for part in text.lower().split() if part]
        if not words:
            return False
        pattern = r"\b" + r"\s+".join(re.escape(word) for word in words) + r"\b"
        return re.search(pattern, prompt) is not None

    def _contains_any(terms: tuple[str, ...]) -> bool:
        return any(_contains_phrase(term) for term in terms)

    folder_terms = (
        "folder",
        "folders",
        "directory",
        "directories",
        "dir names",
    )
    file_terms = ("file", "files", "filenames", "file names")
    listing_terms = ("list", "show", "display", "name", "names", "contents", "content", "items", "entries")
    folder_question_terms = ("what folders", "which folders", "what directories", "which directories")
    file_question_terms = ("what files", "which files")
    recursive_terms = ("recursive", "recursively", "tree")
    bug_terms = (
        "find bug",
        "findbugs",
        "find bugs",
        "bug hunt",
        "bughunter",
        "scan for bugs",
        "review for bugs",
        "audit for bugs",
        "find issues",
        "security issues",
        "vulnerabilities",
    )
    project_scope_terms = (
        "directory",
        "project",
        "repo",
        "repository",
        "codebase",
        "folder",
        "current",
    )

    wants_folders = (
        _contains_any(folder_terms) and _contains_any(listing_terms)
    ) or _contains_any(folder_question_terms)
    wants_files = (
        _contains_any(file_terms) and _contains_any(listing_terms)
    ) or _contains_any(file_question_terms)
    wants_contents = (
        _contains_any(("list", "show", "display"))
        and _contains_any(("contents", "content", "items", "entries"))
    ) or prompt in {"ls", "dir", "list"}
    wants_pwd = _contains_any(("current directory", "present working directory", "pwd", "where am i"))
    wants_recursive = _contains_any(recursive_terms)
    wants_bug_scan = _contains_any(bug_terms) and _contains_any(project_scope_terms)

    if not (wants_pwd or wants_folders or wants_files or wants_contents or wants_bug_scan):
        return None

    tool_name = "powershell" if os.name == "nt" else "bash"
    command = ""
    prefix = ""

    if wants_bug_scan:
        if tool_name == "powershell":
            command = (
                "$patterns = @('TODO','FIXME','BUG','HACK','XXX','except Exception','raise Exception','console.log','print('); "
                "Get-ChildItem -Recurse -File "
                "| Where-Object { $_.Extension -in '.py','.ts','.tsx','.js','.jsx','.java','.go','.rs','.cpp','.c','.cs','.php','.rb' } "
                "| ForEach-Object { Select-String -Path $_.FullName -Pattern $patterns -SimpleMatch } "
                "| Select-Object -First 250 "
                "| ForEach-Object { \"$($_.Path):$($_.LineNumber): $($_.Line.Trim())\" }"
            )
        else:
            command = "grep -RInE \"TODO|FIXME|BUG|HACK|XXX|except Exception|raise Exception|console\\.log|print\\(\" . | head -n 250"
        prefix = "Potential bug markers (heuristic scan):"
    elif wants_folders:
        if tool_name == "powershell":
            command = "Get-ChildItem -Directory -Name"
            if wants_recursive:
                command = "Get-ChildItem -Directory -Recurse -Name"
        else:
            command = "find . -maxdepth 1 -type d -not -path '.' -exec basename {} \\;"
            if wants_recursive:
                command = "find . -type d -not -path '.' -exec basename {} \\;"
        prefix = "Folder names:"
    elif wants_files:
        if tool_name == "powershell":
            command = "Get-ChildItem -File -Name"
            if wants_recursive:
                command = "Get-ChildItem -File -Recurse -Name"
        else:
            command = "find . -maxdepth 1 -type f -exec basename {} \\;"
            if wants_recursive:
                command = "find . -type f -exec basename {} \\;"
        prefix = "File names:"
    elif wants_contents:
        if tool_name == "powershell":
            command = "Get-ChildItem -Name"
            if wants_recursive:
                command = "Get-ChildItem -Recurse -Name"
        else:
            command = "ls -1"
            if wants_recursive:
                command = "find . -print"
        prefix = "Directory contents:"
    else:
        if tool_name == "powershell":
            command = "(Get-Location).Path"
        else:
            command = "pwd"
        prefix = "Current directory:"

    tool_input: dict[str, Any] = {
        "command": command,
        "timeout": 30,
    }
    if project_dir:
        tool_input["cwd"] = project_dir

    return {
        "tool": tool_name,
        "input": tool_input,
        "prefix": prefix,
    }


def _to_openai_content(content: Any) -> str | list[dict[str, Any]]:
    blocks = _normalize_content_blocks(content)
    if not blocks:
        return ""

    only_text = all(block.get("type") == "text" for block in blocks)
    if only_text:
        return "\n".join(str(block.get("text", "")) for block in blocks)

    parts: list[dict[str, Any]] = []
    for block in blocks:
        block_type = str(block.get("type", "")).lower()
        if block_type == "text":
            parts.append({"type": "text", "text": str(block.get("text", ""))})
            continue

        source = block.get("source", {})
        if not isinstance(source, dict):
            continue

        source_type = str(source.get("type", "")).lower().strip()
        image_url = ""
        if source_type == "base64":
            media_type = str(source.get("media_type") or source.get("mime_type") or "image/png")
            data = str(source.get("data", "")).strip()
            if data:
                image_url = f"data:{media_type};base64,{data}"
        elif source_type == "url":
            image_url = str(source.get("url", "")).strip()

        if image_url:
            parts.append({"type": "image_url", "image_url": {"url": image_url}})

    return parts


def _to_anthropic_content(content: Any) -> list[dict[str, Any]]:
    blocks = _normalize_content_blocks(content)
    normalized: list[dict[str, Any]] = []

    for block in blocks:
        block_type = str(block.get("type", "")).lower().strip()
        if block_type == "text":
            text = str(block.get("text", ""))
            if text.strip():
                normalized.append({"type": "text", "text": text})
            continue

        source = block.get("source", {})
        if not isinstance(source, dict):
            continue

        source_type = str(source.get("type", "")).lower().strip()
        if source_type == "base64":
            data = str(source.get("data", "")).strip()
            if not data:
                continue
            media_type = str(source.get("media_type") or source.get("mime_type") or "image/png")
            normalized.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data,
                    },
                }
            )
            continue

        if source_type == "url":
            url = str(source.get("url", "")).strip()
            if url:
                normalized.append({"type": "text", "text": f"Image URL: {url}"})

    return normalized


def _build_openai_messages(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for msg in _truncate_history(history):
        role = str(msg.get("role", "")).lower()
        if role not in {"user", "assistant"}:
            continue
        content = _to_openai_content(msg.get("content", ""))
        if isinstance(content, str) and not content.strip():
            continue
        if isinstance(content, list) and not content:
            continue
        messages.append({"role": role, "content": content})
    return messages


def _build_anthropic_messages(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for msg in _truncate_history(history):
        role = str(msg.get("role", "")).lower()
        if role not in {"user", "assistant"}:
            continue
        content = _to_anthropic_content(msg.get("content", ""))
        if not content:
            continue
        messages.append({"role": role, "content": content})
    return messages


def _anthropic_system_payload(system_text: str) -> str | list[dict[str, Any]]:
    if not ENABLE_PROMPT_CACHE:
        return system_text
    return [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]


def _apply_anthropic_cache_controls(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not ENABLE_PROMPT_CACHE:
        return messages

    marked: list[dict[str, Any]] = []
    # Anthropic allows at most 4 cache_control blocks total in a request.
    # One block is used by system prompt caching, so message blocks must be capped.
    max_message_cache_blocks = max(0, MAX_ANTHROPIC_CACHE_BLOCKS - 1)
    effective_cache_messages = min(N_CACHE_MESSAGES, max_message_cache_blocks)
    start_index = max(0, len(messages) - effective_cache_messages)

    for idx, message in enumerate(messages):
        copied = {
            "role": message.get("role", "user"),
            "content": list(message.get("content", [])) if isinstance(message.get("content"), list) else message.get("content"),
        }
        if (
            effective_cache_messages > 0
            and idx >= start_index
            and isinstance(copied.get("content"), list)
            and copied["content"]
        ):
            first_block = copied["content"][0]
            if isinstance(first_block, dict):
                updated = dict(first_block)
                updated["cache_control"] = {"type": "ephemeral"}
                copied["content"][0] = updated
        marked.append(copied)
    return marked


class AgentLoop:
    def __init__(
        self,
        session_id: str,
        project_dir: str | None = None,
        mode: str | None = None,
        model_override: str | None = None,
        artifact_mode: bool = False,
        disable_tools: bool = False,
        max_tokens: int | None = None,
    ):
        self.session_id = session_id
        self.project_dir = project_dir
        self.mode = normalize_mode(mode)
        self.model_override = _normalize_model_name(model_override) or None
        self.artifact_mode = bool(artifact_mode)
        self.disable_tools = bool(disable_tools)
        self.max_tokens = max(512, min(int(max_tokens or MAX_TOKENS), 65536))

        self.router_mode = os.getenv("ROUTER_MODE", "fixed").strip().lower()
        self.smart_router: SmartRouter | None = None

        self.provider = ""
        self.model = self.model_override or ""
        self.base_url: str | None = None
        self.client: Any = None
        self._init_error: Exception | None = None

        self.permission_checker = get_permission_checker()

        if self.router_mode == "smart" and smart_router_enabled():
            self.provider = "smart"
        else:
            try:
                self._apply_runtime_config(_resolve_provider_config(self.model_override))
            except Exception as exc:
                self._init_error = exc

    def _apply_runtime_config(self, config: RuntimeConfig) -> None:
        provider = config.provider.strip().lower()
        self.provider = provider
        self.model = config.model
        self.base_url = config.base_url

        if provider == "anthropic":
            kwargs: dict[str, Any] = {
                "api_key": config.api_key,
                "base_url": (config.base_url or DEFAULT_ANTHROPIC_BASE_URL).strip(),
            }
            self.client = AsyncAnthropic(**kwargs)
            return

        # Gemini uses native REST in gemini_provider.py.
        if provider == "gemini":
            self.client = None
            return

        # OpenAI-compatible providers (OpenAI, local v1, DeepSeek, Groq, OpenRouter...).
        api_key = config.api_key or "local"
        kwargs = {"api_key": api_key}
        if config.base_url:
            kwargs["base_url"] = config.base_url
        self.client = AsyncOpenAI(**kwargs)

    async def _ensure_runtime_ready(self) -> None:
        if self.router_mode == "smart" and smart_router_enabled():
            if self.smart_router is None:
                self.smart_router = await get_smart_router()
            return

        if self.client is not None:
            return

        if feature_enabled("PROFILES") and not _has_env_overrides():
            profile = await profile_manager.get_active_profile()
            if profile is not None:
                runtime = _runtime_from_profile(profile, self.model_override)
                self._apply_runtime_config(runtime)
                self._init_error = None
                return

        if self._init_error is not None:
            raise self._init_error

        # Last fallback: try environment resolution one more time.
        self._apply_runtime_config(_resolve_provider_config(self.model_override))

    async def _build_system_prompt(self) -> str:
        caveman_mode: str | None = None
        # Skip caveman injection for tool-free sessions (e.g. Design Studio) so
        # the model never responds in caveman style instead of generating HTML.
        if not self.disable_tools and feature_enabled("CAVEMAN", default="0"):
            metadata = await memory_manager.get_session_metadata(self.session_id)
            if isinstance(metadata, dict):
                caveman_mode = normalize_caveman_mode(str(metadata.get("caveman_mode", "")).strip())
            if caveman_mode is None:
                configured_default = get_default_caveman_mode()
                if configured_default != "off":
                    caveman_mode = configured_default
        return await build_system_prompt(
            project_dir=self.project_dir,
            mode=self.mode,
            caveman_mode=caveman_mode,
            artifact_mode=self.artifact_mode,
        )

    def _max_tokens_for_provider(self, provider: str | None = None) -> int:
        resolved_provider = (provider or self.provider or "").strip().lower()
        if resolved_provider == "anthropic":
            cap = int(os.getenv("ANTHROPIC_MAX_TOKENS", "8192"))
            return max(512, min(self.max_tokens, cap))
        return self.max_tokens

    async def run(
        self,
        user_message: str | list[dict[str, Any]],
        history: list[dict[str, Any]],
        approval_callback=None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        if approval_callback:
            self.permission_checker.set_approval_callback(approval_callback)

        with project_dir_context(self.project_dir):
            try:
                await self._ensure_runtime_ready()

                if self.router_mode == "smart" and smart_router_enabled():
                    async for event in self._run_smart(user_message, history):
                        yield event
                    return

                if self.provider == "anthropic":
                    try:
                        async for event in self._run_anthropic(user_message, history):
                            yield event
                    except Exception as exc:
                        if self._is_anthropic_low_credit_error(exc) and self._switch_to_openai_fallback():
                            async for event in self._run_openai(user_message, history):
                                yield event
                        else:
                            raise
                elif self.provider == "gemini":
                    async for event in self._run_gemini(user_message, history, self.model):
                        yield event
                else:
                    try:
                        async for event in self._run_openai(user_message, history):
                            yield event
                    except Exception as exc:
                        if self.provider == "openai" and self._is_openai_quota_error(exc) and self._switch_to_anthropic_fallback():
                            async for event in self._run_anthropic(user_message, history):
                                yield event
                        else:
                            raise

            except Exception as exc:
                yield {"type": "error", "message": self._format_runtime_error(exc)}

    async def _run_smart(
        self,
        user_message: str | list[dict[str, Any]],
        history: list[dict[str, Any]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        if self.smart_router is None:
            raise RuntimeError("Smart router is not initialized")

        attempted: list[str] = []
        router_messages = _truncate_history(history) + [{"role": "user", "content": user_message}]

        while True:
            decision = await self.smart_router.route(
                router_messages,
                model=self.model_override or self.model,
                stream=True,
                exclude_providers=attempted,
            )
            provider_name = str(decision.get("provider", "")).strip().lower()
            model = _normalize_model_name(decision.get("model", ""))
            base_url = str(decision.get("base_url", "")).strip() or None
            api_key = str(decision.get("api_key", "")).strip()
            provider_obj = next((p for p in self.smart_router.providers if p.name == provider_name), None)

            if not model and provider_obj is not None:
                model = self.smart_router._resolve_model(provider_obj, "", router_messages)
            if not model:
                model = _normalize_model_name(self.model_override or self.model)
            if not model:
                raise RuntimeError(
                    f"Smart router returned no model for provider {provider_name or '(unknown)'}"
                )

            start = time.perf_counter()
            try:
                self.provider = provider_name
                self.model = model

                if provider_name == "gemini":
                    async for event in self._run_gemini(user_message, history, model):
                        yield event
                else:
                    self._apply_runtime_config(
                        RuntimeConfig(
                            provider=provider_name,
                            model=model,
                            api_key=api_key,
                            base_url=base_url,
                        )
                    )
                    async for event in self._run_openai(user_message, history):
                        yield event

                if provider_obj is not None:
                    self.smart_router._record_success(provider_obj, (time.perf_counter() - start) * 1000.0)
                break
            except Exception as exc:
                if provider_obj is not None:
                    self.smart_router._record_error(provider_obj)

                attempted.append(provider_name)
                if not self.smart_router.fallback_enabled or len(attempted) >= len(self.smart_router.providers):
                    raise exc

    def _is_openai_quota_error(self, error: Exception) -> bool:
        msg = str(error).lower()
        return (
            "insufficient_quota" in msg
            or "exceeded your current quota" in msg
            or ("openai" in msg and "quota" in msg)
        )

    def _is_anthropic_low_credit_error(self, error: Exception) -> bool:
        msg = str(error).lower()
        return (
            "anthropic" in msg
            and (
                "credit balance is too low" in msg
                or "plans & billing" in msg
                or "purchase credits" in msg
            )
        )

    def _switch_to_openai_fallback(self) -> bool:
        openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not openai_key:
            return False

        fallback_model = os.getenv("OPENAI_FALLBACK_MODEL", "").strip()
        configured_model = (self.model_override or os.getenv("MODEL", "")).strip()
        if not fallback_model:
            if configured_model.lower().startswith(OPENAI_MODEL_PREFIXES):
                fallback_model = configured_model
            else:
                fallback_model = DEFAULT_OPENAI_MODEL

        self._apply_runtime_config(
            RuntimeConfig(
                provider="openai",
                model=fallback_model,
                api_key=openai_key,
                base_url=os.getenv("OPENAI_BASE_URL", "").strip() or None,
            )
        )
        return True

    def _switch_to_anthropic_fallback(self) -> bool:
        anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not anthropic_key:
            return False

        fallback_model = os.getenv("ANTHROPIC_FALLBACK_MODEL", "").strip()
        configured_model = (self.model_override or os.getenv("MODEL", "")).strip()
        if not fallback_model:
            if configured_model.lower().startswith(ANTHROPIC_MODEL_PREFIXES):
                fallback_model = configured_model
            else:
                fallback_model = DEFAULT_ANTHROPIC_MODEL

        self._apply_runtime_config(
            RuntimeConfig(
                provider="anthropic",
                model=fallback_model,
                api_key=anthropic_key,
                base_url=os.getenv("ANTHROPIC_BASE_URL", "").strip() or None,
            )
        )
        return True

    def _format_runtime_error(self, error: Exception) -> str:
        if self._is_openai_quota_error(error):
            if os.getenv("ANTHROPIC_API_KEY", "").strip():
                return (
                    "OpenAI quota is exhausted and fallback to Anthropic also failed. "
                    "Check ANTHROPIC_API_KEY and optionally set ANTHROPIC_FALLBACK_MODEL in backend/.env."
                )
            return (
                "OpenAI quota is exhausted. Add OpenAI credits, "
                "or set ANTHROPIC_API_KEY and MODEL=claude-sonnet-4-6 in backend/.env to use Anthropic."
            )

        if self._is_anthropic_low_credit_error(error):
            if os.getenv("OPENAI_API_KEY", "").strip():
                return (
                    "Anthropic credits are insufficient and fallback to OpenAI also failed. "
                    "Check OPENAI_API_KEY and optionally set OPENAI_FALLBACK_MODEL in backend/.env."
                )
            return (
                "Anthropic credits are insufficient. Add Anthropic credits, "
                "or set OPENAI_API_KEY and MODEL=gpt-4o in backend/.env to use OpenAI."
            )

        return str(error)

    async def _create_openai_stream(self, messages: list[dict[str, Any]]):
        assert self.client is not None

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self._max_tokens_for_provider(),
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if not self.disable_tools:
            kwargs["tools"] = OPENAI_TOOLS
            kwargs["tool_choice"] = "auto"

        try:
            return await self.client.chat.completions.create(**kwargs)
        except Exception as exc:
            msg = str(exc).lower()
            if "stream_options" in msg or "include_usage" in msg or "unknown parameter" in msg:
                kwargs.pop("stream_options", None)
                return await self.client.chat.completions.create(**kwargs)
            raise

    async def _run_openai(
        self,
        user_message: str | list[dict[str, Any]],
        history: list[dict[str, Any]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        forced_tool = None if self.disable_tools else _infer_local_forced_tool_call(user_message, self.provider, self.project_dir)
        if forced_tool is not None:
            async for event in self._run_forced_local_tool(forced_tool):
                yield event
            return

        system = await self._build_system_prompt()
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        messages.extend(_build_openai_messages(history))
        messages.append({"role": "user", "content": _to_openai_content(user_message)})

        total_input_tokens = 0
        total_output_tokens = 0

        while True:
            collected_text = ""
            tool_calls_raw: dict[int, dict[str, str]] = {}

            stream = await self._create_openai_stream(messages)
            finish_reason = None

            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None

                if delta:
                    if delta.content:
                        collected_text += delta.content
                        yield {"type": "text", "content": delta.content}

                    if delta.tool_calls:
                        for tc_chunk in delta.tool_calls:
                            idx = tc_chunk.index
                            if idx not in tool_calls_raw:
                                tool_calls_raw[idx] = {"id": "", "name": "", "arguments": ""}
                            if tc_chunk.id:
                                tool_calls_raw[idx]["id"] = tc_chunk.id
                            if tc_chunk.function:
                                if tc_chunk.function.name:
                                    tool_calls_raw[idx]["name"] = tc_chunk.function.name
                                if tc_chunk.function.arguments:
                                    tool_calls_raw[idx]["arguments"] += tc_chunk.function.arguments

                if chunk.choices and chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason

                if hasattr(chunk, "usage") and chunk.usage:
                    total_input_tokens += chunk.usage.prompt_tokens or 0
                    total_output_tokens += chunk.usage.completion_tokens or 0

            tool_calls: list[dict[str, Any]] = []
            for idx in sorted(tool_calls_raw.keys()):
                tc = tool_calls_raw[idx]
                try:
                    parsed_input = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    parsed_input = {}
                tool_calls.append({"id": tc["id"], "name": tc["name"], "input": parsed_input})

            assistant_msg: dict[str, Any] = {"role": "assistant", "content": collected_text or None}
            if tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": json.dumps(tc["input"])},
                    }
                    for tc in tool_calls
                ]
            messages.append(assistant_msg)

            if finish_reason == "stop" or not tool_calls:
                yield {
                    "type": "done",
                    "usage": {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "model": self.model,
                    },
                }
                break

            for tc in tool_calls:
                tool_name = tc["name"]
                tool_input = tc["input"]
                tool_use_id = str(tc.get("id") or f"tool-{int(time.time() * 1000)}")
                tool = TOOL_MAP.get(tool_name)

                if not tool:
                    result = ToolResult(success=False, output="", error=f"Unknown tool: {tool_name}")
                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "output": result.error,
                        "success": False,
                    }
                else:
                    approved, reason = await self.permission_checker.check(tool, **tool_input)
                    yield {
                        "type": "tool_start",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "input": tool_input,
                        "approved": approved,
                    }

                    if not approved:
                        result = ToolResult(success=False, output="", error=f"Operation denied: {reason}")
                    else:
                        try:
                            if tool_name in {"bash", "powershell", "repl"} and _streaming_tools_enabled():
                                line_queue: asyncio.Queue[str | None] = asyncio.Queue()

                                async def _on_bash_output(line: str) -> None:
                                    await line_queue.put(line)

                                async def _run_streaming_bash() -> ToolResult:
                                    try:
                                        return await tool.execute(**tool_input, on_output=_on_bash_output)
                                    except TypeError:
                                        # Streaming callback unsupported: fallback to batch mode.
                                        return await tool.execute(**tool_input)
                                    finally:
                                        await line_queue.put(None)

                                bash_task = asyncio.create_task(_run_streaming_bash())
                                while True:
                                    streamed_line = await line_queue.get()
                                    if streamed_line is None:
                                        break
                                    yield {
                                        "type": "tool_output",
                                        "tool_use_id": tool_use_id,
                                        "line": streamed_line,
                                    }
                                result = await bash_task
                            else:
                                result = await tool.execute(**tool_input)
                        except Exception as exc:
                            result = ToolResult(success=False, output="", error=f"Tool error: {exc}")

                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "output": result.output if result.success else result.error,
                        "success": result.success,
                        "metadata": result.metadata,
                    }

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_use_id,
                        "content": result.output if result.success else f"Error: {result.error}",
                    }
                )

    async def _run_forced_local_tool(self, forced_tool: dict[str, Any]) -> AsyncGenerator[dict[str, Any], None]:
        tool_name = str(forced_tool.get("tool", "")).strip()
        tool_input = dict(forced_tool.get("input", {}) or {})
        prefix = str(forced_tool.get("prefix", "")).strip()

        tool_use_id = f"forced-local-{int(time.time() * 1000)}"
        tool = TOOL_MAP.get(tool_name)
        if tool is None:
            message = f"Unknown tool: {tool_name or '(empty)'}"
            yield {"type": "error", "message": message}
            return

        approved, reason = await self.permission_checker.check(tool, **tool_input)
        yield {
            "type": "tool_start",
            "tool": tool_name,
            "tool_use_id": tool_use_id,
            "input": tool_input,
            "approved": approved,
        }

        if not approved:
            result = ToolResult(success=False, output="", error=f"Operation denied: {reason}")
        else:
            try:
                if tool_name in {"bash", "powershell", "repl"} and _streaming_tools_enabled():
                    line_queue: asyncio.Queue[str | None] = asyncio.Queue()

                    async def _on_output(line: str) -> None:
                        await line_queue.put(line)

                    async def _run_streaming_tool() -> ToolResult:
                        try:
                            return await tool.execute(**tool_input, on_output=_on_output)
                        except TypeError:
                            return await tool.execute(**tool_input)
                        finally:
                            await line_queue.put(None)

                    task = asyncio.create_task(_run_streaming_tool())
                    while True:
                        streamed_line = await line_queue.get()
                        if streamed_line is None:
                            break
                        yield {
                            "type": "tool_output",
                            "tool_use_id": tool_use_id,
                            "line": streamed_line,
                        }
                    result = await task
                else:
                    result = await tool.execute(**tool_input)
            except Exception as exc:
                result = ToolResult(success=False, output="", error=f"Tool error: {exc}")

        yield {
            "type": "tool_result",
            "tool": tool_name,
            "tool_use_id": tool_use_id,
            "output": result.output if result.success else result.error,
            "success": result.success,
            "metadata": result.metadata,
        }

        output_text = (result.output if result.success else result.error) or "(no output)"
        final_text = f"{prefix}\n{output_text}" if prefix else output_text
        yield {"type": "text", "content": final_text}

        yield {
            "type": "done",
            "usage": {
                "input_tokens": 0,
                "output_tokens": max(1, len(final_text) // 4),
                "model": self.model,
            },
        }

    async def _run_anthropic(
        self,
        user_message: str | list[dict[str, Any]],
        history: list[dict[str, Any]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        system = await self._build_system_prompt()
        messages = _build_anthropic_messages(history)
        messages.append({"role": "user", "content": _to_anthropic_content(user_message)})

        total_input_tokens = 0
        total_output_tokens = 0
        total_cache_write_tokens = 0
        total_cache_read_tokens = 0

        while True:
            request_messages = _apply_anthropic_cache_controls(messages)
            kwargs: dict[str, Any] = {
                "model": self.model,
                "max_tokens": self._max_tokens_for_provider("anthropic"),
                "system": _anthropic_system_payload(system),
                "messages": request_messages,
            }
            if not self.disable_tools:
                kwargs["tools"] = ANTHROPIC_TOOLS
            response = await self.client.messages.create(**kwargs)

            usage = getattr(response, "usage", None)
            if usage:
                total_input_tokens += getattr(usage, "input_tokens", 0) or 0
                total_output_tokens += getattr(usage, "output_tokens", 0) or 0
                total_cache_write_tokens += getattr(usage, "cache_creation_input_tokens", 0) or 0
                total_cache_read_tokens += getattr(usage, "cache_read_input_tokens", 0) or 0

            assistant_content: list[dict[str, Any]] = []
            tool_calls: list[dict[str, Any]] = []

            for block in response.content:
                block_type = getattr(block, "type", "")
                if block_type == "text":
                    text = getattr(block, "text", "")
                    if text:
                        assistant_content.append({"type": "text", "text": text})
                        yield {"type": "text", "content": text}
                elif block_type == "tool_use":
                    tool_input = getattr(block, "input", {}) or {}
                    tool_call = {
                        "id": getattr(block, "id", ""),
                        "name": getattr(block, "name", ""),
                        "input": tool_input,
                    }
                    assistant_content.append(
                        {
                            "type": "tool_use",
                            "id": tool_call["id"],
                            "name": tool_call["name"],
                            "input": tool_input,
                        }
                    )
                    tool_calls.append(tool_call)

            messages.append({"role": "assistant", "content": assistant_content})

            if not tool_calls:
                yield {
                    "type": "done",
                    "usage": {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "input_cache_write_tokens": total_cache_write_tokens,
                        "input_cache_read_tokens": total_cache_read_tokens,
                        "model": self.model,
                    },
                }
                break

            tool_result_blocks: list[dict[str, Any]] = []

            for tc in tool_calls:
                tool_name = tc["name"]
                tool_input = tc["input"]
                tool_use_id = str(tc.get("id") or f"tool-{int(time.time() * 1000)}")
                tool = TOOL_MAP.get(tool_name)

                if not tool:
                    result = ToolResult(success=False, output="", error=f"Unknown tool: {tool_name}")
                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "output": result.error,
                        "success": False,
                    }
                else:
                    approved, reason = await self.permission_checker.check(tool, **tool_input)
                    yield {
                        "type": "tool_start",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "input": tool_input,
                        "approved": approved,
                    }

                    if not approved:
                        result = ToolResult(success=False, output="", error=f"Operation denied: {reason}")
                    else:
                        try:
                            if tool_name in {"bash", "powershell", "repl"} and _streaming_tools_enabled():
                                line_queue: asyncio.Queue[str | None] = asyncio.Queue()

                                async def _on_bash_output(line: str) -> None:
                                    await line_queue.put(line)

                                async def _run_streaming_bash() -> ToolResult:
                                    try:
                                        return await tool.execute(**tool_input, on_output=_on_bash_output)
                                    except TypeError:
                                        # Streaming callback unsupported: fallback to batch mode.
                                        return await tool.execute(**tool_input)
                                    finally:
                                        await line_queue.put(None)

                                bash_task = asyncio.create_task(_run_streaming_bash())
                                while True:
                                    streamed_line = await line_queue.get()
                                    if streamed_line is None:
                                        break
                                    yield {
                                        "type": "tool_output",
                                        "tool_use_id": tool_use_id,
                                        "line": streamed_line,
                                    }
                                result = await bash_task
                            else:
                                result = await tool.execute(**tool_input)
                        except Exception as exc:
                            result = ToolResult(success=False, output="", error=f"Tool error: {exc}")

                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "tool_use_id": tool_use_id,
                        "output": result.output if result.success else result.error,
                        "success": result.success,
                        "metadata": result.metadata,
                    }

                tool_result_blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": result.output if result.success else f"Error: {result.error}",
                        "is_error": not result.success,
                    }
                )

            messages.append({"role": "user", "content": tool_result_blocks})

    async def _run_gemini(
        self,
        user_message: str | list[dict[str, Any]],
        history: list[dict[str, Any]],
        model: str,
    ) -> AsyncGenerator[dict[str, Any], None]:
        system = await self._build_system_prompt()
        messages: list[dict[str, Any]] = _truncate_history(history)
        messages.append({"role": "user", "content": user_message})

        stream_result = await gemini_chat(
            messages=messages,
            model=model,
            system=system,
            max_tokens=self._max_tokens_for_provider("gemini"),
            stream=True,
            tools=None if self.disable_tools else OPENAI_TOOLS,
        )

        output_tokens = 0
        if hasattr(stream_result, "__aiter__"):
            async for chunk in stream_result:  # type: ignore[union-attr]
                if not isinstance(chunk, str):
                    continue
                output_tokens += max(1, len(chunk) // 4)
                yield {"type": "text", "content": chunk}
        elif isinstance(stream_result, dict):
            text = ""
            content_blocks = stream_result.get("content", [])
            if isinstance(content_blocks, list):
                for block in content_blocks:
                    if isinstance(block, dict) and isinstance(block.get("text"), str):
                        text += block["text"]
            if text:
                output_tokens += max(1, len(text) // 4)
                yield {"type": "text", "content": text}

        yield {
            "type": "done",
            "usage": {
                "input_tokens": max(1, len(_text_from_content(user_message)) // 4),
                "output_tokens": output_tokens,
                "model": model,
            },
        }
