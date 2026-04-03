import json
import os
from typing import Any, AsyncGenerator

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from agent.modes import normalize_mode
from agent.permissions import get_permission_checker
from agent.prompt_builder import build_system_prompt
from tools import ALL_TOOLS, TOOL_MAP, ToolResult
from tools.path_guard import project_dir_context

DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL_PREFIXES = ("gpt-", "o1", "o3", "o4")
ANTHROPIC_MODEL_PREFIXES = ("claude",)
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "8192"))


def build_openai_tools() -> list[dict]:
    openai_tools = []
    for tool in ALL_TOOLS:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
            }
        })
    return openai_tools


def build_anthropic_tools() -> list[dict]:
    anthropic_tools = []
    for tool in ALL_TOOLS:
        anthropic_tools.append(tool.to_anthropic_schema())
    return anthropic_tools


OPENAI_TOOLS = build_openai_tools()
ANTHROPIC_TOOLS = build_anthropic_tools()


def _resolve_provider_config() -> tuple[str, str, str]:
    """Return provider, model, and api_key for the active runtime."""
    configured_model = os.getenv("MODEL", "").strip()
    configured_model_lower = configured_model.lower()
    primary_provider = os.getenv("PRIMARY_PROVIDER", "anthropic").strip().lower()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

    if api_key and anthropic_key:
        if primary_provider == "openai":
            model = configured_model if configured_model_lower.startswith(OPENAI_MODEL_PREFIXES) else DEFAULT_OPENAI_MODEL
            return "openai", model, api_key

        model = configured_model if configured_model_lower.startswith(ANTHROPIC_MODEL_PREFIXES) else DEFAULT_ANTHROPIC_MODEL
        return "anthropic", model, anthropic_key

    if api_key:
        if configured_model_lower.startswith(ANTHROPIC_MODEL_PREFIXES):
            raise ValueError(
                f"MODEL='{configured_model}' looks like a Claude model, but only OPENAI_API_KEY is configured. "
                "Set MODEL to an OpenAI model (for example: gpt-4o) or provide ANTHROPIC_API_KEY."
            )
        return "openai", configured_model or DEFAULT_OPENAI_MODEL, api_key

    if anthropic_key:
        model = configured_model or DEFAULT_ANTHROPIC_MODEL
        if model.lower().startswith(OPENAI_MODEL_PREFIXES):
            raise ValueError(
                f"MODEL='{model}' looks like an OpenAI model, but only ANTHROPIC_API_KEY is configured. "
                "Set MODEL to a Claude model (for example: claude-sonnet-4-6) or provide OPENAI_API_KEY."
            )
        return "anthropic", model, anthropic_key

    raise ValueError(
        "No model provider API key is configured. Set OPENAI_API_KEY (OpenAI models) "
        "or ANTHROPIC_API_KEY (Claude models) in backend/.env."
    )


class AgentLoop:
    def __init__(self, session_id: str, project_dir: str | None = None, mode: str | None = None):
        self.session_id = session_id
        self.project_dir = project_dir
        self.mode = normalize_mode(mode)
        self.provider, self.model, api_key = _resolve_provider_config()
        if self.provider == "openai":
            self.client: Any = AsyncOpenAI(api_key=api_key)
        else:
            self.client = AsyncAnthropic(api_key=api_key)
        self.permission_checker = get_permission_checker()

    async def _build_system_prompt(self) -> str:
        return await build_system_prompt(project_dir=self.project_dir, mode=self.mode)

    async def run(
        self,
        user_message: str,
        history: list[dict],
        approval_callback=None,
    ) -> AsyncGenerator[dict, None]:
        if approval_callback:
            self.permission_checker.set_approval_callback(approval_callback)

        with project_dir_context(self.project_dir):
            try:
                if self.provider == "openai":
                    try:
                        async for event in self._run_openai(user_message, history):
                            yield event
                    except Exception as e:
                        if self._is_openai_quota_error(e) and self._switch_to_anthropic_fallback():
                            async for event in self._run_anthropic(user_message, history):
                                yield event
                        else:
                            raise
                else:
                    try:
                        async for event in self._run_anthropic(user_message, history):
                            yield event
                    except Exception as e:
                        if self._is_anthropic_low_credit_error(e) and self._switch_to_openai_fallback():
                            async for event in self._run_openai(user_message, history):
                                yield event
                        else:
                            raise

            except Exception as e:
                yield {"type": "error", "message": self._format_runtime_error(e)}

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
        configured_model = os.getenv("MODEL", "").strip()
        if not fallback_model:
            if configured_model.lower().startswith(OPENAI_MODEL_PREFIXES):
                fallback_model = configured_model
            else:
                fallback_model = DEFAULT_OPENAI_MODEL

        self.provider = "openai"
        self.model = fallback_model
        self.client = AsyncOpenAI(api_key=openai_key)
        return True

    def _switch_to_anthropic_fallback(self) -> bool:
        anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not anthropic_key:
            return False

        fallback_model = os.getenv("ANTHROPIC_FALLBACK_MODEL", "").strip()
        configured_model = os.getenv("MODEL", "").strip()
        if not fallback_model:
            if configured_model.lower().startswith(ANTHROPIC_MODEL_PREFIXES):
                fallback_model = configured_model
            else:
                fallback_model = DEFAULT_ANTHROPIC_MODEL

        self.provider = "anthropic"
        self.model = fallback_model
        self.client = AsyncAnthropic(api_key=anthropic_key)
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

    async def _run_openai(self, user_message: str, history: list[dict]) -> AsyncGenerator[dict, None]:
        system = await self._build_system_prompt()
        messages = [{"role": "system", "content": system}]

        for msg in history:
            if msg["role"] in ("user", "assistant") and isinstance(msg.get("content"), str):
                messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": user_message})

        total_input_tokens = 0
        total_output_tokens = 0

        while True:
            collected_text = ""
            tool_calls_raw: dict[int, dict] = {}

            stream = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
                stream=True,
                stream_options={"include_usage": True},
            )

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

            tool_calls = []
            for idx in sorted(tool_calls_raw.keys()):
                tc = tool_calls_raw[idx]
                try:
                    parsed_input = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    parsed_input = {}
                tool_calls.append({"id": tc["id"], "name": tc["name"], "input": parsed_input})

            assistant_msg: dict = {"role": "assistant", "content": collected_text or None}
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
                tool = TOOL_MAP.get(tool_name)

                if not tool:
                    result = ToolResult(success=False, output="", error=f"Unknown tool: {tool_name}")
                    yield {"type": "tool_result", "tool": tool_name, "output": result.error, "success": False}
                else:
                    approved, reason = await self.permission_checker.check(tool, **tool_input)
                    yield {"type": "tool_start", "tool": tool_name, "input": tool_input, "approved": approved}

                    if not approved:
                        result = ToolResult(success=False, output="", error=f"Operation denied: {reason}")
                    else:
                        try:
                            result = await tool.execute(**tool_input)
                        except Exception as e:
                            result = ToolResult(success=False, output="", error=f"Tool error: {str(e)}")

                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "output": result.output if result.success else result.error,
                        "success": result.success,
                    }

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result.output if result.success else f"Error: {result.error}",
                })

    async def _run_anthropic(self, user_message: str, history: list[dict]) -> AsyncGenerator[dict, None]:
        system = await self._build_system_prompt()
        messages: list[dict[str, Any]] = []

        for msg in history:
            if msg["role"] in ("user", "assistant") and isinstance(msg.get("content"), str):
                messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": user_message})

        total_input_tokens = 0
        total_output_tokens = 0

        while True:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=messages,
                tools=ANTHROPIC_TOOLS,
            )

            usage = getattr(response, "usage", None)
            if usage:
                total_input_tokens += getattr(usage, "input_tokens", 0) or 0
                total_output_tokens += getattr(usage, "output_tokens", 0) or 0

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
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tool_call["id"],
                        "name": tool_call["name"],
                        "input": tool_input,
                    })
                    tool_calls.append(tool_call)

            messages.append({"role": "assistant", "content": assistant_content})

            if not tool_calls:
                yield {
                    "type": "done",
                    "usage": {
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                        "model": self.model,
                    },
                }
                break

            tool_result_blocks: list[dict[str, Any]] = []

            for tc in tool_calls:
                tool_name = tc["name"]
                tool_input = tc["input"]
                tool = TOOL_MAP.get(tool_name)

                if not tool:
                    result = ToolResult(success=False, output="", error=f"Unknown tool: {tool_name}")
                    yield {"type": "tool_result", "tool": tool_name, "output": result.error, "success": False}
                else:
                    approved, reason = await self.permission_checker.check(tool, **tool_input)
                    yield {"type": "tool_start", "tool": tool_name, "input": tool_input, "approved": approved}

                    if not approved:
                        result = ToolResult(success=False, output="", error=f"Operation denied: {reason}")
                    else:
                        try:
                            result = await tool.execute(**tool_input)
                        except Exception as e:
                            result = ToolResult(success=False, output="", error=f"Tool error: {str(e)}")

                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "output": result.output if result.success else result.error,
                        "success": result.success,
                    }

                tool_result_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": result.output if result.success else f"Error: {result.error}",
                    "is_error": not result.success,
                })

            messages.append({"role": "user", "content": tool_result_blocks})
