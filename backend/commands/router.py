import json
import shlex
from dataclasses import dataclass

from agent.coordinator import agent_coordinator
from agent.modes import DEFAULT_MODE, get_mode, list_modes, normalize_mode
from mcp.registry import mcp_registry
from memory.manager import memory_manager
from observability.usage import summarize_usage
from skills.registry import skill_registry
from tasks.manager import task_manager


KNOWN_ROOT_COMMANDS = [
    "/help",
    "/cost",
    "/session",
    "/memory",
    "/mode",
    "/tasks",
    "/mcp",
    "/agents",
    "/skills",
]


@dataclass
class CommandExecutionResult:
    name: str
    text: str


def is_command_message(message: str) -> bool:
    return message.strip().startswith("/")


def _levenshtein_distance(left: str, right: str, max_distance: int = 3) -> int | None:
    if left == right:
        return 0

    if abs(len(left) - len(right)) > max_distance:
        return None

    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        row_min = current[0]
        for j, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            value = min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            )
            current.append(value)
            if value < row_min:
                row_min = value

        if row_min > max_distance:
            return None
        previous = current

    distance = previous[-1]
    if distance > max_distance:
        return None
    return distance


def _suggest_commands(raw_command: str, limit: int = 3) -> list[str]:
    command = raw_command.strip().lower()
    if not command.startswith("/"):
        command = f"/{command}"

    scored: list[tuple[int, str]] = []
    for candidate in KNOWN_ROOT_COMMANDS:
        if candidate == command:
            continue

        if candidate.startswith(command):
            score = 0
        elif command in candidate:
            score = 1
        else:
            distance = _levenshtein_distance(command, candidate, max_distance=3)
            if distance is None:
                continue
            score = 2 + distance

        scored.append((score, candidate))

    scored.sort(key=lambda item: (item[0], len(item[1]), item[1]))
    return [candidate for _, candidate in scored[:limit]]


def _help_text() -> str:
    return "\n".join([
        "Available commands:",
        "/help - Show this command list",
        "/cost [days] - Show token and estimated cost usage",
        "/session - List recent sessions",
        "/session current - Show current session id",
        "/memory <text> - Append a note to global memory",
        "/memory show - Show loaded memory context",
        "/mode - Show current session mode",
        "/mode list - List available execution modes",
        "/mode set <name> - Set session mode",
        "/mode reset - Reset session mode to default",
        "/tasks - List recent tasks",
        "/tasks create <prompt> - Create a background task",
        "/tasks get <task_id> - Show task status",
        "/tasks stop <task_id> - Stop a running task",
        "/mcp list - List MCP server entries",
        "/mcp add <name> <command> [args...] - Add MCP server entry",
        "/mcp remove <name> - Remove MCP server entry",
        "/mcp tools <name> - Show discovered/configured tools",
        "/mcp call <name> <tool> [json_args] - Execute MCP tool",
        "/agents - List spawned sub-agents",
        "/agents spawn <goal> - Spawn sub-agent",
        "/agents get <agent_id> - Show sub-agent details",
        "/agents stop <agent_id> - Stop sub-agent",
        "/skills - List bundled skills",
        "/skills show <name> - Show skill content",
    ])


def _format_cost(days: int) -> str:
    data = summarize_usage(days=days, limit=10)
    totals = data.get("totals", {})
    by_model = data.get("by_model", {})

    lines = [
        f"Usage summary ({data.get('window_days', days)}d)",
        f"Events: {data.get('events_count', 0)}",
        f"Input tokens: {int(totals.get('input_tokens', 0) or 0):,}",
        f"Output tokens: {int(totals.get('output_tokens', 0) or 0):,}",
        f"Estimated cost: ${float(totals.get('estimated_cost_usd', 0.0) or 0.0):.6f}",
    ]

    if by_model:
        lines.append("")
        lines.append("By model:")
        for model, row in by_model.items():
            lines.append(
                f"- {model}: in={int(row.get('input_tokens', 0)):,}, out={int(row.get('output_tokens', 0)):,}, cost=${float(row.get('estimated_cost_usd', 0.0)):.6f}"
            )

    return "\n".join(lines)


async def _format_sessions(current_session_id: str) -> str:
    sessions = await memory_manager.list_sessions()
    if not sessions:
        return "No sessions found yet."

    lines = [f"Current session: {current_session_id}", "Recent sessions:"]
    for item in sessions[:10]:
        marker = "*" if item.get("session_id") == current_session_id else " "
        sid = item.get("session_id", "")
        title = item.get("title", "Untitled")
        count = int(item.get("message_count", 0) or 0)
        lines.append(f"{marker} {sid} | {count} msgs | {title}")
    return "\n".join(lines)


async def _format_tasks() -> str:
    tasks = await task_manager.list_tasks(limit=10)
    if not tasks:
        return "No tasks found yet."

    lines = ["Recent tasks:"]
    for item in tasks:
        task_id = str(item.get("task_id", ""))
        status = str(item.get("status", "unknown"))
        prompt = str(item.get("prompt", ""))
        summary = prompt[:60] + ("..." if len(prompt) > 60 else "")
        lines.append(f"- {task_id} | {status} | {summary}")
    return "\n".join(lines)


async def _format_mcp_servers() -> str:
    servers = await mcp_registry.list_servers()
    if not servers:
        return "No MCP servers configured."

    lines = ["MCP servers:"]
    for item in servers:
        name = str(item.get("name", ""))
        command = str(item.get("command", ""))
        args = item.get("args", [])
        argv = " ".join([command] + [str(arg) for arg in args])
        lines.append(f"- {name}: {argv}".strip())
    return "\n".join(lines)


async def _format_agents() -> str:
    agents = await agent_coordinator.list_agents(limit=10)
    if not agents:
        return "No agents spawned yet."

    lines = ["Spawned agents:"]
    for item in agents:
        agent_id = str(item.get("agent_id", ""))
        role = str(item.get("role", "general"))
        status = str(item.get("status", "unknown"))
        goal = str(item.get("goal", ""))
        summary = goal[:56] + ("..." if len(goal) > 56 else "")
        lines.append(f"- {agent_id} | {role} | {status} | {summary}")
    return "\n".join(lines)


def _format_skills() -> str:
    skills = skill_registry.list_skills()
    if not skills:
        return "No skills available."
    lines = ["Skills:"]
    for item in skills:
        lines.append(f"- {item.get('name')}: {item.get('description', '')}")
    return "\n".join(lines)


async def _format_mode_status(session_id: str) -> str:
    metadata = await memory_manager.get_session_metadata(session_id)
    try:
        current_mode = normalize_mode(str(metadata.get("mode", DEFAULT_MODE)))
    except ValueError:
        current_mode = DEFAULT_MODE
    selected = get_mode(current_mode)

    lines = [
        f"Current mode: {selected.key} ({selected.title})",
        selected.summary,
        "",
        "Available modes:",
    ]
    for item in list_modes():
        mode_key = str(item.get("key", ""))
        marker = "*" if mode_key == current_mode else " "
        lines.append(f"{marker} {mode_key}: {item.get('summary', '')}")

    lines.append("")
    lines.append("Usage: /mode list | /mode set <name> | /mode reset")
    return "\n".join(lines)


async def execute_command(message: str, session_id: str, project_dir: str | None = None) -> CommandExecutionResult:
    raw = message.strip()

    try:
        parts = shlex.split(raw)
    except ValueError:
        parts = raw.split()

    if not parts:
        return CommandExecutionResult(name="help", text=_help_text())

    command = parts[0].lower()
    args = parts[1:]

    if command in {"/help", "/?"}:
        return CommandExecutionResult(name="help", text=_help_text())

    if command in {"/cost", "/usage"}:
        days = 7
        if args:
            try:
                days = max(1, min(365, int(args[0])))
            except ValueError:
                return CommandExecutionResult(name="cost", text="Usage: /cost [days]")
        return CommandExecutionResult(name="cost", text=_format_cost(days))

    if command == "/session":
        if args and args[0].lower() == "current":
            return CommandExecutionResult(name="session", text=f"Current session id: {session_id}")
        return CommandExecutionResult(name="session", text=await _format_sessions(session_id))

    if command == "/memory":
        if not args:
            return CommandExecutionResult(name="memory", text="Usage: /memory <text> or /memory show")

        if args[0].lower() == "show":
            memory = await memory_manager.load_memory(project_dir)
            if not memory.strip():
                return CommandExecutionResult(name="memory", text="No memory content found.")
            preview = memory[:3500]
            if len(memory) > 3500:
                preview += "\n\n... (truncated)"
            return CommandExecutionResult(name="memory", text=preview)

        note = " ".join(args).strip()
        if not note:
            return CommandExecutionResult(name="memory", text="Usage: /memory <text> or /memory show")
        await memory_manager.append_to_memory(note)
        return CommandExecutionResult(name="memory", text="Saved note to global memory.")

    if command == "/mode":
        if not args:
            return CommandExecutionResult(name="mode", text=await _format_mode_status(session_id))

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="mode", text=await _format_mode_status(session_id))

        if action == "set":
            if len(args) < 2:
                return CommandExecutionResult(name="mode", text="Usage: /mode set <name>")
            try:
                mode = normalize_mode(args[1])
            except ValueError as e:
                return CommandExecutionResult(name="mode", text=str(e))

            await memory_manager.update_session_metadata(
                session_id,
                {"mode": mode},
                create_if_missing=True,
            )
            selected = get_mode(mode)
            return CommandExecutionResult(
                name="mode",
                text=f"Session mode set to {selected.key} ({selected.title}).",
            )

        if action in {"reset", "default", "clear"}:
            await memory_manager.update_session_metadata(
                session_id,
                {"mode": DEFAULT_MODE},
                create_if_missing=True,
            )
            selected = get_mode(DEFAULT_MODE)
            return CommandExecutionResult(
                name="mode",
                text=f"Session mode reset to {selected.key} ({selected.title}).",
            )

        return CommandExecutionResult(name="mode", text="Usage: /mode [list|set|reset]")

    if command == "/tasks":
        if not args:
            return CommandExecutionResult(name="tasks", text=await _format_tasks())

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="tasks", text=await _format_tasks())

        if action == "create":
            prompt = " ".join(args[1:]).strip()
            if not prompt:
                return CommandExecutionResult(name="tasks", text="Usage: /tasks create <prompt>")
            task = await task_manager.create_task(
                prompt=prompt,
                project_dir=project_dir,
                requested_by_session=session_id,
            )
            return CommandExecutionResult(
                name="tasks",
                text=f"Task created: {task.get('task_id')} (status: {task.get('status')})",
            )

        if action == "get":
            if len(args) < 2:
                return CommandExecutionResult(name="tasks", text="Usage: /tasks get <task_id>")
            payload = await task_manager.get_task(args[1])
            if payload is None:
                return CommandExecutionResult(name="tasks", text=f"Task not found: {args[1]}")
            return CommandExecutionResult(
                name="tasks",
                text=(
                    f"Task: {payload.get('task_id')}\n"
                    f"Status: {payload.get('status')}\n"
                    f"Created: {payload.get('created_at')}\n"
                    f"Started: {payload.get('started_at')}\n"
                    f"Completed: {payload.get('completed_at')}\n"
                    f"Error: {payload.get('error')}"
                ),
            )

        if action == "stop":
            if len(args) < 2:
                return CommandExecutionResult(name="tasks", text="Usage: /tasks stop <task_id>")
            stopped = await task_manager.stop_task(args[1])
            if not stopped:
                return CommandExecutionResult(name="tasks", text=f"Task not running or not found: {args[1]}")
            return CommandExecutionResult(name="tasks", text=f"Stop signal sent to task: {args[1]}")

        return CommandExecutionResult(name="tasks", text="Usage: /tasks [list|create|get|stop]")

    if command == "/mcp":
        if not args:
            return CommandExecutionResult(name="mcp", text=await _format_mcp_servers())

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="mcp", text=await _format_mcp_servers())

        if action == "add":
            if len(args) < 3:
                return CommandExecutionResult(name="mcp", text="Usage: /mcp add <name> <command> [args...]")
            name = args[1]
            command_value = args[2]
            command_args = args[3:] if len(args) > 3 else []
            try:
                payload = await mcp_registry.add_server(
                    name=name,
                    command=command_value,
                    args=command_args,
                )
            except ValueError as e:
                return CommandExecutionResult(name="mcp", text=f"Failed to add MCP server: {e}")
            return CommandExecutionResult(name="mcp", text=f"Added MCP server: {payload.get('name')}")

        if action == "remove":
            if len(args) < 2:
                return CommandExecutionResult(name="mcp", text="Usage: /mcp remove <name>")
            removed = await mcp_registry.remove_server(args[1])
            if not removed:
                return CommandExecutionResult(name="mcp", text=f"MCP server not found: {args[1]}")
            return CommandExecutionResult(name="mcp", text=f"Removed MCP server: {args[1]}")

        if action == "tools":
            if len(args) < 2:
                return CommandExecutionResult(name="mcp", text="Usage: /mcp tools <name>")
            try:
                tools = await mcp_registry.discover_tools(args[1])
            except ValueError as e:
                return CommandExecutionResult(name="mcp", text=str(e))

            if not tools:
                return CommandExecutionResult(name="mcp", text="No configured tools found for this MCP server.")

            lines = [f"MCP tools for {args[1]}:"]
            for item in tools:
                lines.append(f"- {item.get('name')}")
            return CommandExecutionResult(name="mcp", text="\n".join(lines))

        if action == "call":
            if len(args) < 3:
                return CommandExecutionResult(name="mcp", text="Usage: /mcp call <name> <tool> [json_args]")

            server_name = args[1]
            tool_name = args[2]
            payload: dict = {}

            if len(args) > 3:
                raw_payload = " ".join(args[3:]).strip()
                try:
                    parsed = json.loads(raw_payload)
                except json.JSONDecodeError:
                    return CommandExecutionResult(
                        name="mcp",
                        text="json_args must be a valid JSON object. Example: /mcp call myserver tool_name '{\"path\": \".\"}'",
                    )

                if not isinstance(parsed, dict):
                    return CommandExecutionResult(name="mcp", text="json_args must be a JSON object")
                payload = parsed

            try:
                result = await mcp_registry.call_tool(server_name, tool_name, arguments=payload)
            except ValueError as e:
                return CommandExecutionResult(name="mcp", text=str(e))
            except Exception as e:
                return CommandExecutionResult(name="mcp", text=f"MCP call failed: {e}")

            pretty = json.dumps(result, indent=2)
            if len(pretty) > 3500:
                pretty = pretty[:3500] + "\n... (truncated)"
            return CommandExecutionResult(name="mcp", text=pretty)

        return CommandExecutionResult(name="mcp", text="Usage: /mcp [list|add|remove|tools|call]")

    if command == "/agents":
        if not args:
            return CommandExecutionResult(name="agents", text=await _format_agents())

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="agents", text=await _format_agents())

        if action == "spawn":
            goal = " ".join(args[1:]).strip()
            if not goal:
                return CommandExecutionResult(name="agents", text="Usage: /agents spawn <goal>")
            try:
                payload = await agent_coordinator.spawn_agent(
                    goal=goal,
                    role="general",
                    project_dir=project_dir,
                    parent_session_id=session_id,
                )
            except ValueError as e:
                return CommandExecutionResult(name="agents", text=str(e))
            return CommandExecutionResult(
                name="agents",
                text=f"Spawned agent: {payload.get('agent_id')} (task: {payload.get('task_id')})",
            )

        if action == "get":
            if len(args) < 2:
                return CommandExecutionResult(name="agents", text="Usage: /agents get <agent_id>")
            payload = await agent_coordinator.get_agent(args[1])
            if payload is None:
                return CommandExecutionResult(name="agents", text=f"Agent not found: {args[1]}")
            return CommandExecutionResult(
                name="agents",
                text=(
                    f"Agent: {payload.get('agent_id')}\n"
                    f"Role: {payload.get('role')}\n"
                    f"Status: {payload.get('status')}\n"
                    f"Task: {payload.get('task_id')}\n"
                    f"Error: {payload.get('task_error')}"
                ),
            )

        if action == "stop":
            if len(args) < 2:
                return CommandExecutionResult(name="agents", text="Usage: /agents stop <agent_id>")
            stopped = await agent_coordinator.stop_agent(args[1])
            if not stopped:
                return CommandExecutionResult(name="agents", text=f"Agent not running or not found: {args[1]}")
            return CommandExecutionResult(name="agents", text=f"Stop signal sent to agent: {args[1]}")

        return CommandExecutionResult(name="agents", text="Usage: /agents [list|spawn|get|stop]")

    if command == "/skills":
        if not args:
            return CommandExecutionResult(name="skills", text=_format_skills())

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="skills", text=_format_skills())

        if action == "show":
            if len(args) < 2:
                return CommandExecutionResult(name="skills", text="Usage: /skills show <name>")
            payload = skill_registry.get_skill(args[1])
            if payload is None:
                return CommandExecutionResult(name="skills", text=f"Skill not found: {args[1]}")
            content = str(payload.get("content", ""))
            if len(content) > 3500:
                content = content[:3500] + "\n\n... (truncated)"
            return CommandExecutionResult(name="skills", text=content)

        return CommandExecutionResult(name="skills", text="Usage: /skills [list|show]")

    suggestions = _suggest_commands(command)
    if suggestions:
        hint_lines = "\n".join(f"- {item}" for item in suggestions)
        return CommandExecutionResult(
            name="unknown",
            text=(
                f"Unknown command: {command}\n\n"
                f"Did you mean:\n{hint_lines}\n\n"
                "Use /help to see all commands."
            ),
        )

    return CommandExecutionResult(
        name="unknown",
        text=f"Unknown command: {command}\n\n{_help_text()}",
    )
