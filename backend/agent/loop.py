import os
import asyncio
import json
from typing import AsyncGenerator
from anthropic import AsyncAnthropic
from tools import ALL_TOOLS, TOOL_MAP, ToolResult
from agent.permissions import get_permission_checker
from memory.manager import memory_manager

MODEL = os.getenv("MODEL", "claude-sonnet-4-6")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "8192"))

SYSTEM_PROMPT = """You are KŌDO, a powerful personal autonomous AI agent. You can:
- Execute bash commands to interact with the OS
- Read, write, and edit files
- Search codebases with grep and glob
- Fetch web pages for documentation and info
- Chain multiple tools together to complete complex tasks autonomously

You are direct, capable, and efficient. When given a task:
1. Think through the steps needed
2. Use tools proactively without asking unnecessary questions
3. Report what you're doing as you do it
4. If something fails, diagnose and try an alternative approach

You have access to persistent memory (shown below if available). Use it to personalize your responses.

Always show your work — briefly explain each tool call before making it."""

ANTHROPIC_TOOLS = [t.to_anthropic_schema() for t in ALL_TOOLS]


class AgentLoop:
    def __init__(self, session_id: str, project_dir: str | None = None):
        self.session_id = session_id
        self.project_dir = project_dir
        self.client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.permission_checker = get_permission_checker()
        self._pending_approvals: dict[str, asyncio.Future] = {}

    async def _build_system_prompt(self) -> str:
        memory = await memory_manager.load_memory(self.project_dir)
        if memory:
            return SYSTEM_PROMPT + "\n\n" + memory
        return SYSTEM_PROMPT

    async def run(
        self,
        user_message: str,
        history: list[dict],
        approval_callback=None,
    ) -> AsyncGenerator[dict, None]:
        """
        Core tool-calling loop. Yields SSE-style event dicts:
          {type: "text", content: str}
          {type: "tool_start", tool: str, input: dict}
          {type: "tool_result", tool: str, output: str, success: bool}
          {type: "permission_request", id: str, tool: str, preview: str}
          {type: "permission_result", id: str, approved: bool}
          {type: "done", usage: dict}
          {type: "error", message: str}
        """
        if approval_callback:
            self.permission_checker.set_approval_callback(approval_callback)

        messages = list(history) + [{"role": "user", "content": user_message}]
        system = await self._build_system_prompt()
        total_input_tokens = 0
        total_output_tokens = 0

        try:
            while True:
                # Stream the LLM response
                collected_text = ""
                tool_calls = []
                usage = {}

                async with self.client.messages.stream(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system,
                    messages=messages,
                    tools=ANTHROPIC_TOOLS,
                ) as stream:
                    async for event in stream:
                        event_type = event.type

                        if event_type == "content_block_start":
                            if event.content_block.type == "tool_use":
                                tool_calls.append({
                                    "id": event.content_block.id,
                                    "name": event.content_block.name,
                                    "input_raw": "",
                                })

                        elif event_type == "content_block_delta":
                            delta = event.delta
                            if delta.type == "text_delta":
                                collected_text += delta.text
                                yield {"type": "text", "content": delta.text}
                            elif delta.type == "input_json_delta":
                                if tool_calls:
                                    tool_calls[-1]["input_raw"] += delta.partial_json

                        elif event_type == "message_delta":
                            if hasattr(event.delta, "stop_reason"):
                                stop_reason = event.delta.stop_reason
                            if hasattr(event, "usage"):
                                usage = {
                                    "input_tokens": event.usage.input_tokens if hasattr(event.usage, "input_tokens") else 0,
                                    "output_tokens": event.usage.output_tokens if hasattr(event.usage, "output_tokens") else 0,
                                }

                    # Get final message for proper structure
                    final_msg = await stream.get_final_message()
                    stop_reason = final_msg.stop_reason
                    total_input_tokens += final_msg.usage.input_tokens
                    total_output_tokens += final_msg.usage.output_tokens

                # Parse tool input JSON
                for tc in tool_calls:
                    try:
                        tc["input"] = json.loads(tc["input_raw"]) if tc["input_raw"] else {}
                    except json.JSONDecodeError:
                        tc["input"] = {}

                # Build assistant message content
                assistant_content = []
                if collected_text:
                    assistant_content.append({"type": "text", "text": collected_text})
                for tc in tool_calls:
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["input"],
                    })

                messages.append({"role": "assistant", "content": assistant_content})

                if stop_reason == "end_turn" or not tool_calls:
                    yield {
                        "type": "done",
                        "usage": {
                            "input_tokens": total_input_tokens,
                            "output_tokens": total_output_tokens,
                            "model": MODEL,
                        },
                    }
                    break

                # Execute tool calls
                tool_results = []
                for tc in tool_calls:
                    tool_name = tc["name"]
                    tool_input = tc["input"]
                    tool = TOOL_MAP.get(tool_name)

                    if not tool:
                        result = ToolResult(success=False, output="", error=f"Unknown tool: {tool_name}")
                        yield {"type": "tool_result", "tool": tool_name, "output": result.error, "success": False}
                    else:
                        # Permission check
                        approved, reason = await self.permission_checker.check(tool, **tool_input)

                        yield {"type": "tool_start", "tool": tool_name, "input": tool_input, "approved": approved}

                        if not approved:
                            result = ToolResult(success=False, output="", error=f"Operation denied by user: {reason}")
                        else:
                            try:
                                result = await tool.execute(**tool_input)
                            except Exception as e:
                                result = ToolResult(success=False, output="", error=f"Tool execution error: {str(e)}")

                        yield {
                            "type": "tool_result",
                            "tool": tool_name,
                            "output": result.output if result.success else result.error,
                            "success": result.success,
                        }

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc["id"],
                        "content": result.output if result.success else f"Error: {result.error}",
                    })

                messages.append({"role": "user", "content": tool_results})

        except Exception as e:
            yield {"type": "error", "message": str(e)}
