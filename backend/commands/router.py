import json
import os
import shlex
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agent.coordinator import agent_coordinator
from agent.modes import DEFAULT_MODE, get_mode, list_modes, normalize_mode
from code_review_graph_integration import manager as crg_manager
from doctor import run_report, run_runtime_checks
from mcp.registry import mcp_registry
from memory.manager import memory_manager
from observability.usage import summarize_usage
from privacy import telemetry_disabled
from profiles.manager import profile_manager
from providers.smart_router import ROUTER_STRATEGIES, get_smart_router, smart_router_enabled
from skills.registry import skill_registry
from tasks.manager import task_manager
from tools import TOOL_MAP


KNOWN_ROOT_COMMANDS = [
    "/help",
    "/stop",
    "/cost",
    "/search",
    "/git",
    "/session",
    "/memory",
    "/checkpoint",
    "/mode",
    "/provider",
    "/doctor",
    "/router",
    "/model",
    "/privacy",
    "/tasks",
    "/mcp",
    "/crg",
    "/agents",
    "/skills",
    "/teleport",
    "/ultraplan",
    "/dream",
    "/advisor",
    "/bughunter",
]

COMMAND_REGISTRY: dict[str, str] = {
    "/help": "Show available commands",
    "/stop": "Stop current response generation",
    "/cost": "Show token and estimated cost usage",
    "/search": "Search the web via configured providers",
    "/git": "Run safe, read-only git commands",
    "/session": "List and inspect sessions",
    "/memory": "Manage global memory notes",
    "/checkpoint": "Create/list/restore session checkpoints",
    "/mode": "Inspect or set session mode",
    "/provider": "Inspect and activate provider profiles",
    "/doctor": "Run runtime health checks",
    "/router": "Inspect smart router status and strategy",
    "/model": "Inspect or override current model",
    "/privacy": "Show no-telemetry privacy status",
    "/tasks": "Manage background tasks",
    "/mcp": "Manage and call MCP servers",
    "/crg": "Operate code-review-graph analysis workflows",
    "/agents": "Manage spawned sub-agents",
    "/skills": "Inspect bundled skills",
    "/teleport": "Quick-switch session mode with aliases",
    "/ultraplan": "Generate a high-fidelity implementation plan",
    "/dream": "Generate a bold next-iteration concept",
    "/advisor": "Run strategic advisor-style review guidance",
    "/bughunter": "Run targeted bug-hunting and validation flow",
}


@dataclass
class CommandExecutionResult:
    name: str
    text: str
    run_prompt: str | None = None


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
        "/stop - Stop current response generation",
        "/cost [days] - Show token and estimated cost usage",
        "/search <query> - Search the web and return top results",
        "/git <subcommand> - Run safe read-only git command",
        "/git log|status|diff - Shortcut git commands",
        "/session - List recent sessions",
        "/session current - Show current session id",
        "/memory <text> - Append a note to global memory",
        "/memory show - Show loaded memory context",
        "/checkpoint - Create checkpoint",
        "/checkpoint <label> - Create checkpoint with label",
        "/checkpoint list - List checkpoints",
        "/checkpoint restore <id> --yes - Restore checkpoint",
        "/mode - Show current session mode",
        "/mode list - List available execution modes",
        "/mode set <name> - Set session mode",
        "/mode reset - Reset session mode to default",
        "/provider - Show provider profiles and active provider",
        "/provider list - List saved provider profiles",
        "/provider set <name> - Activate provider profile",
        "/doctor - Run runtime health checks",
        "/doctor report - Run and save full doctor report",
        "/router - Show smart router status",
        "/router strategy <name> - Set smart router strategy",
        "/model - Show current model/provider",
        "/model set <model> - Override model for this session",
        "/privacy - Show no-telemetry mode status",
        "/tasks - List recent tasks",
        "/tasks create <prompt> - Create a background task",
        "/tasks get <task_id> - Show task status",
        "/tasks stop <task_id> - Stop a running task",
        "/mcp list - List MCP server entries",
        "/mcp add <name> <command> [args...] - Add MCP server entry",
        "/mcp remove <name> - Remove MCP server entry",
        "/mcp tools <name> - Show discovered/configured tools",
        "/mcp call <name> <tool> [json_args] - Execute MCP tool",
        "/crg status - Show code-review-graph availability and graph stats",
        "/crg build [--full] [--postprocess full|minimal|none] [--repo <path>] - Build or update graph",
        "/crg detect [base] [--detail standard|minimal] [--repo <path>] - Analyze changed files risk",
        "/crg impact [base] [--depth N] [--repo <path>] - Compute blast radius",
        "/crg review [base] [--depth N] [--repo <path>] - Build review context bundle",
        "/crg query <pattern> <target> [--detail standard|minimal] [--repo <path>] - Structural graph query",
        "/crg search <query> [--kind Kind] [--limit N] [--repo <path>] - Semantic/keyword search",
        "/crg arch [--repo <path>] - Architecture overview",
        "/crg flows [--sort criticality|depth|node_count|name] [--limit N] [--repo <path>] - List flows",
        "/crg stats [--repo <path>] - Graph stats",
        "/agents - List spawned sub-agents",
        "/agents spawn <goal> - Spawn sub-agent",
        "/agents get <agent_id> - Show sub-agent details",
        "/agents stop <agent_id> - Stop sub-agent",
        "/skills - List bundled skills",
        "/skills show <name> - Show skill content",
        "/skills run <name> - Run a bundled skill now",
        "/teleport <mode|alias> - Quick switch mode (aliases: coord, hunt, ultra)",
        "/ultraplan <goal> - Build an execution-ready implementation plan",
        "/dream [focus] - Brainstorm a high-impact next iteration",
        "/advisor [topic] - Ask for strategic advisor review",
        "/bughunter <issue> - Trigger bug-hunting workflow",
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


def _truncate_text(text: str, max_chars: int = 3500) -> str:
    value = str(text or "")
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "\n... (truncated)"


def _pretty_json(payload: Any, max_chars: int = 3500) -> str:
    try:
        rendered = json.dumps(payload, indent=2, default=str)
    except TypeError:
        rendered = str(payload)
    return _truncate_text(rendered, max_chars=max_chars)


def _crg_help_text() -> str:
    return "\n".join([
        "Code Review Graph commands:",
        "/crg status",
        "/crg build [--full] [--postprocess full|minimal|none] [--repo <path>]",
        "/crg detect [base] [--detail standard|minimal] [--repo <path>]",
        "/crg impact [base] [--depth N] [--repo <path>]",
        "/crg review [base] [--depth N] [--repo <path>]",
        "/crg query <pattern> <target> [--detail standard|minimal] [--repo <path>]",
        "/crg search <query> [--kind Kind] [--limit N] [--repo <path>]",
        "/crg arch [--repo <path>]",
        "/crg flows [--sort criticality|depth|node_count|name] [--limit N] [--repo <path>]",
        "/crg stats [--repo <path>]",
    ])


def _pop_flag(args: list[str], flag: str) -> bool:
    if flag in args:
        args.remove(flag)
        return True
    return False


def _pop_option(args: list[str], flag: str) -> str | None:
    if flag not in args:
        return None
    idx = args.index(flag)
    if idx + 1 >= len(args):
        raise ValueError(f"Missing value for {flag}")
    value = args[idx + 1]
    del args[idx:idx + 2]
    return value


def _pop_int_option(args: list[str], flag: str, default: int) -> int:
    raw = _pop_option(args, flag)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as e:
        raise ValueError(f"{flag} must be an integer") from e


def _resolve_crg_repo_root(explicit_repo: str | None, project_dir: str | None) -> str | None:
    candidate = str(explicit_repo or "").strip() or str(project_dir or "").strip()
    if candidate:
        return candidate
    root = crg_manager.get_crg_repo_root()
    return str(root) if root else None


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


def _format_doctor_checks(checks: list) -> str:
    if not checks:
        return "No doctor checks returned."

    lines: list[str] = []
    failed = 0
    for check in checks:
        marker = "PASS" if check.passed else "FAIL"
        lines.append(f"[{marker}] {check.name}: {check.message}")
        if check.fix:
            lines.append(f"  fix: {check.fix}")
        if not check.passed:
            failed += 1

    lines.append("")
    lines.append(f"Summary: {len(checks) - failed}/{len(checks)} checks passed")
    return "\n".join(lines)


async def _format_provider_profiles() -> str:
    rows = await profile_manager.list_profiles()
    active = await profile_manager.get_active_profile()
    active_name = active.name if active else None

    if not rows:
        return "No provider profiles saved. Use /provider set <name> after creating profiles via API."

    lines = ["Provider profiles:"]
    for row in rows:
        marker = "*" if (row.name or "") == (active_name or "") else " "
        lines.append(f"{marker} {row.name} | {row.provider} | {row.model} | goal={row.goal}")

    if active:
        lines.append("")
        lines.append(f"Active profile: {active.name} ({active.provider}/{active.model})")

    return "\n".join(lines)


async def _format_router_status() -> str:
    if not smart_router_enabled():
        return "Smart router is disabled (ROUTER_MODE=fixed or KODO_ENABLE_SMART_ROUTER=0)."

    router = await get_smart_router()
    status = router.get_status()
    lines = [
        f"Router strategy: {status.get('strategy')}",
        f"Fallback enabled: {status.get('fallback_enabled')}",
        "",
        "Providers:",
    ]

    for row in status.get("providers", []):
        lines.append(
            f"- {row.get('provider')}: healthy={row.get('healthy')} latency={row.get('latency_ms')}ms errors={row.get('errors')} cost/1k={row.get('cost_per_1k')}"
        )
    return "\n".join(lines)


async def _format_model_status(session_id: str) -> str:
    metadata = await memory_manager.get_session_metadata(session_id)
    override = str(metadata.get("model_override", "")).strip()
    active = await profile_manager.get_active_profile()

    lines = []
    if override:
        lines.append(f"Session model override: {override}")
    else:
        lines.append("Session model override: (none)")

    if active:
        lines.append(f"Active profile model: {active.provider}/{active.model}")
    else:
        lines.append("Active profile model: (none)")

    env_model = os.getenv("MODEL", "").strip()
    lines.append(f"Environment MODEL: {env_model or '(unset)'}")
    return "\n".join(lines)


async def _run_tool_command(tool_name: str, **kwargs) -> CommandExecutionResult:
    tool = TOOL_MAP.get(tool_name)
    if tool is None:
        return CommandExecutionResult(name=tool_name, text=f"Tool not registered: {tool_name}")

    result = await tool.execute(**kwargs)
    if result.success:
        return CommandExecutionResult(name=tool_name, text=result.output)
    return CommandExecutionResult(name=tool_name, text=result.error or "Tool execution failed")


def _teleport_target(value: str) -> str:
    aliases = {
        "coord": "coordinator",
        "coordinator": "coordinator",
        "hunt": "bughunter",
        "bug": "bughunter",
        "bughunter": "bughunter",
        "ultra": "ultraplan",
        "ultraplan": "ultraplan",
        "dream": "ultraplan",
        "plan": "plan",
        "debug": "debug",
        "review": "review",
        "execute": "execute",
    }
    normalized = value.strip().lower()
    return aliases.get(normalized, normalized)


def _ultraplan_prompt(goal: str) -> str:
    target = goal.strip() or "ship the highest-impact next project milestone"
    return (
        "[UltraPlan]\n"
        f"Goal: {target}\n\n"
        "Produce an execution-ready plan with:\n"
        "1) assumptions and constraints\n"
        "2) ordered implementation steps\n"
        "3) risks and mitigations\n"
        "4) validation checklist and completion criteria\n"
        "Keep it actionable and specific to this workspace."
    )


def _dream_prompt(focus: str) -> str:
    target = focus.strip() or "the highest-leverage next capability"
    return (
        "[Dream]\n"
        f"Focus: {target}\n\n"
        "Propose one bold but realistic next iteration for this project. Include:\n"
        "1) concept title\n"
        "2) why now\n"
        "3) implementation sketch (3-7 steps)\n"
        "4) top risks and fallback plan\n"
        "5) a fast validation experiment"
    )


def _advisor_prompt(topic: str) -> str:
    target = topic.strip() or "overall architecture and execution quality"
    return (
        "[Advisor]\n"
        f"Topic: {target}\n\n"
        "Act as a pragmatic staff engineer advisor. Provide:\n"
        "1) what is strong\n"
        "2) top strategic gaps\n"
        "3) highest ROI next actions\n"
        "4) validation signals that prove progress\n"
        "Be concrete and prioritized."
    )


def _bughunter_prompt(issue: str) -> str:
    target = issue.strip() or "the most likely failure path in the current code changes"
    return (
        "[BugHunter]\n"
        f"Target: {target}\n\n"
        "Run a bug-hunting workflow:\n"
        "1) reproduce or infer failure signals\n"
        "2) identify likely root cause\n"
        "3) propose minimal fix\n"
        "4) add verification steps/tests\n"
        "Keep edits focused and evidence-driven."
    )


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

    if command == "/stop":
        return CommandExecutionResult(
            name="stop",
            text="Stop requested. Use the UI stop control (Esc or stop button) to cancel the active stream immediately.",
        )

    if command == "/teleport":
        if not args:
            return CommandExecutionResult(
                name="teleport",
                text="Usage: /teleport <execute|plan|debug|review|coordinator|bughunter|ultraplan>",
            )

        destination = _teleport_target(args[0])
        try:
            mode = normalize_mode(destination)
        except ValueError as e:
            return CommandExecutionResult(name="teleport", text=str(e))

        await memory_manager.update_session_metadata(
            session_id,
            {"mode": mode},
            create_if_missing=True,
        )
        selected = get_mode(mode)
        return CommandExecutionResult(
            name="teleport",
            text=f"Teleported to mode: {selected.key} ({selected.title}).",
        )

    if command == "/ultraplan":
        goal = " ".join(args).strip()
        return CommandExecutionResult(
            name="ultraplan",
            text="UltraPlan engaged.",
            run_prompt=_ultraplan_prompt(goal),
        )

    if command == "/dream":
        focus = " ".join(args).strip()
        return CommandExecutionResult(
            name="dream",
            text="Dream mode engaged.",
            run_prompt=_dream_prompt(focus),
        )

    if command == "/advisor":
        topic = " ".join(args).strip()
        return CommandExecutionResult(
            name="advisor",
            text="Advisor review engaged.",
            run_prompt=_advisor_prompt(topic),
        )

    if command == "/bughunter":
        issue = " ".join(args).strip()
        return CommandExecutionResult(
            name="bughunter",
            text="BugHunter engaged.",
            run_prompt=_bughunter_prompt(issue),
        )

    if command in {"/cost", "/usage"}:
        days = 7
        if args:
            try:
                days = max(1, min(365, int(args[0])))
            except ValueError:
                return CommandExecutionResult(name="cost", text="Usage: /cost [days]")
        return CommandExecutionResult(name="cost", text=_format_cost(days))

    if command == "/search":
        query = " ".join(args).strip()
        if not query:
            return CommandExecutionResult(name="search", text="Usage: /search <query>")

        tool_result = await _run_tool_command("web_search", query=query, num_results=5)
        if tool_result.name == "web_search" and tool_result.text.strip().startswith("["):
            try:
                data = json.loads(tool_result.text)
            except json.JSONDecodeError:
                return CommandExecutionResult(name="search", text=tool_result.text)

            if not isinstance(data, list) or not data:
                return CommandExecutionResult(name="search", text="No search results found.")

            lines = ["Search results:"]
            for idx, item in enumerate(data[:5], start=1):
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title", "") or "Untitled")
                url = str(item.get("url", "") or "")
                snippet = str(item.get("snippet", "") or "")
                lines.append(f"{idx}. {title}")
                if url:
                    lines.append(f"   {url}")
                if snippet:
                    lines.append(f"   {snippet}")
            return CommandExecutionResult(name="search", text="\n".join(lines))

        return CommandExecutionResult(name="search", text=tool_result.text)

    if command == "/git":
        if not args:
            return CommandExecutionResult(name="git", text="Usage: /git <subcommand>")

        action = args[0].lower()
        if action == "log":
            git_command = "log --oneline -15"
        elif action == "status":
            git_command = "status --short"
        elif action == "diff":
            git_command = "diff --stat"
        else:
            git_command = " ".join(args).strip()

        tool_result = await _run_tool_command("git_run", command=git_command, cwd=project_dir)
        return CommandExecutionResult(name="git", text=tool_result.text)

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

    if command == "/checkpoint":
        if not args:
            history = await memory_manager.load_session(session_id)
            label = f"checkpoint at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}"
            checkpoint_id = await memory_manager.create_checkpoint(session_id, history, label=label)
            return CommandExecutionResult(name="checkpoint", text=f"Created checkpoint {checkpoint_id}: {label}")

        action = args[0].lower()
        if action == "list":
            rows = await memory_manager.list_checkpoints(session_id)
            if not rows:
                return CommandExecutionResult(name="checkpoint", text="No checkpoints found for this session.")
            lines = ["Checkpoints:"]
            for row in rows:
                lines.append(
                    f"- {row.get('checkpoint_id')} | {row.get('label') or 'checkpoint'} | {row.get('message_count')} msgs | {row.get('created_at')}"
                )
            return CommandExecutionResult(name="checkpoint", text="\n".join(lines))

        if action == "restore":
            if len(args) < 2:
                return CommandExecutionResult(name="checkpoint", text="Usage: /checkpoint restore <id> --yes")
            if "--yes" not in args:
                return CommandExecutionResult(
                    name="checkpoint",
                    text="Restore requires confirmation. Run: /checkpoint restore <id> --yes",
                )

            checkpoint_id = args[1].strip()
            try:
                restored = await memory_manager.restore_checkpoint(session_id, checkpoint_id)
            except ValueError as e:
                return CommandExecutionResult(name="checkpoint", text=str(e))

            metadata = await memory_manager.get_session_metadata(session_id)
            await memory_manager.save_session(session_id, restored, metadata=metadata)
            return CommandExecutionResult(
                name="checkpoint",
                text=f"Restored checkpoint {checkpoint_id}. Session now has {len(restored)} messages.",
            )

        label = " ".join(args).strip()
        history = await memory_manager.load_session(session_id)
        checkpoint_id = await memory_manager.create_checkpoint(session_id, history, label=label)
        return CommandExecutionResult(name="checkpoint", text=f"Created checkpoint {checkpoint_id}: {label}")

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

    if command == "/provider":
        if not args:
            return CommandExecutionResult(name="provider", text=await _format_provider_profiles())

        action = args[0].lower()
        if action == "list":
            return CommandExecutionResult(name="provider", text=await _format_provider_profiles())

        if action == "set":
            if len(args) < 2:
                return CommandExecutionResult(name="provider", text="Usage: /provider set <name>")
            try:
                await profile_manager.activate_profile(args[1])
            except ValueError as e:
                return CommandExecutionResult(name="provider", text=str(e))

            active = await profile_manager.get_active_profile()
            if active and str(active.model or "").strip():
                await memory_manager.update_session_metadata(
                    session_id,
                    {"model_override": str(active.model).strip()},
                    create_if_missing=True,
                )
            return CommandExecutionResult(
                name="provider",
                text=f"Activated profile: {(active.name if active else args[1])}",
            )

        return CommandExecutionResult(name="provider", text="Usage: /provider [list|set]")

    if command == "/doctor":
        if not args:
            checks = await run_runtime_checks()
            return CommandExecutionResult(name="doctor", text=_format_doctor_checks(checks))

        action = args[0].lower()
        if action == "report":
            report = await run_report()
            summary = report.get("summary", {})
            return CommandExecutionResult(
                name="doctor",
                text=(
                    f"Doctor report written: {report.get('report_path')}\n"
                    f"Passed: {summary.get('passed')}/{summary.get('total')}\n"
                    f"All passed: {summary.get('all_passed')}"
                ),
            )

        return CommandExecutionResult(name="doctor", text="Usage: /doctor [report]")

    if command == "/router":
        if not args:
            return CommandExecutionResult(name="router", text=await _format_router_status())

        action = args[0].lower()
        if action == "strategy":
            if len(args) < 2:
                return CommandExecutionResult(name="router", text="Usage: /router strategy <name>")

            strategy = args[1].lower().strip()
            if strategy not in ROUTER_STRATEGIES:
                return CommandExecutionResult(
                    name="router",
                    text=f"Invalid strategy: {strategy}. Valid: {', '.join(sorted(ROUTER_STRATEGIES))}",
                )
            if not smart_router_enabled():
                return CommandExecutionResult(name="router", text="Smart router is disabled.")

            router = await get_smart_router()
            router.set_strategy(strategy)
            return CommandExecutionResult(name="router", text=f"Router strategy set to {strategy}")

        return CommandExecutionResult(name="router", text="Usage: /router [strategy]")

    if command == "/model":
        if not args:
            return CommandExecutionResult(name="model", text=await _format_model_status(session_id))

        action = args[0].lower()
        if action == "set":
            if len(args) < 2:
                return CommandExecutionResult(name="model", text="Usage: /model set <model>")
            override = args[1].strip()
            if not override:
                return CommandExecutionResult(name="model", text="Usage: /model set <model>")

            await memory_manager.update_session_metadata(
                session_id,
                {"model_override": override},
                create_if_missing=True,
            )
            return CommandExecutionResult(name="model", text=f"Session model override set to: {override}")

        return CommandExecutionResult(name="model", text="Usage: /model [set]")

    if command == "/privacy":
        enabled = telemetry_disabled()
        return CommandExecutionResult(
            name="privacy",
            text=(
                "No-telemetry mode is ACTIVE (KODO_NO_TELEMETRY=1). "
                "Audit and usage event writes are disabled."
                if enabled
                else "No-telemetry mode is disabled (KODO_NO_TELEMETRY=0)."
            ),
        )

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

    if command == "/crg":
        if not args:
            return CommandExecutionResult(name="crg", text=_crg_help_text())

        action = args[0].lower()
        if action in {"help", "list"}:
            return CommandExecutionResult(name="crg", text=_crg_help_text())

        action_args = args[1:].copy()
        try:
            explicit_repo = _pop_option(action_args, "--repo")
        except ValueError as e:
            return CommandExecutionResult(name="crg", text=str(e))
        repo_root = _resolve_crg_repo_root(explicit_repo, project_dir)

        if action == "status":
            if action_args:
                return CommandExecutionResult(name="crg", text="Usage: /crg status [--repo <path>]")
            payload: dict[str, Any] = {
                "status": "ok",
                "crg_available": crg_manager.crg_available(),
                "repo_root": repo_root,
            }
            if payload["crg_available"]:
                payload["graph_stats"] = crg_manager.list_graph_stats(repo_root=repo_root)
            return CommandExecutionResult(name="crg", text=_pretty_json(payload))

        if action == "build":
            full_rebuild = _pop_flag(action_args, "--full")
            try:
                postprocess = _pop_option(action_args, "--postprocess") or "full"
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if postprocess not in {"full", "minimal", "none"}:
                return CommandExecutionResult(
                    name="crg",
                    text="--postprocess must be one of: full, minimal, none",
                )
            if action_args:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg build [--full] [--postprocess full|minimal|none] [--repo <path>]",
                )
            result = crg_manager.build_graph(
                repo_root=repo_root,
                full_rebuild=full_rebuild,
                postprocess=postprocess,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "detect":
            try:
                detail_level = _pop_option(action_args, "--detail") or "standard"
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if detail_level not in {"standard", "minimal"}:
                return CommandExecutionResult(name="crg", text="--detail must be one of: standard, minimal")
            if len(action_args) > 1:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg detect [base] [--detail standard|minimal] [--repo <path>]",
                )
            base = action_args[0] if action_args else "HEAD~1"
            result = crg_manager.detect_changes(
                repo_root=repo_root,
                base=base,
                detail_level=detail_level,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "impact":
            try:
                depth = _pop_int_option(action_args, "--depth", 2)
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if len(action_args) > 1:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg impact [base] [--depth N] [--repo <path>]",
                )
            base = action_args[0] if action_args else "HEAD~1"
            result = crg_manager.get_impact_radius(
                repo_root=repo_root,
                base=base,
                max_depth=depth,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "review":
            try:
                depth = _pop_int_option(action_args, "--depth", 2)
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if len(action_args) > 1:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg review [base] [--depth N] [--repo <path>]",
                )
            base = action_args[0] if action_args else "HEAD~1"
            result = crg_manager.get_review_context(
                repo_root=repo_root,
                base=base,
                max_depth=depth,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "query":
            try:
                detail_level = _pop_option(action_args, "--detail") or "standard"
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if detail_level not in {"standard", "minimal"}:
                return CommandExecutionResult(name="crg", text="--detail must be one of: standard, minimal")
            if len(action_args) < 2:
                return CommandExecutionResult(
                    name="crg",
                    text=(
                        "Usage: /crg query <pattern> <target> [--detail standard|minimal] [--repo <path>]\n"
                        "Patterns: callers_of, callees_of, imports_of, importers_of, children_of, tests_for, inheritors_of, file_summary"
                    ),
                )
            pattern = action_args[0]
            target = " ".join(action_args[1:]).strip()
            result = crg_manager.query_graph(
                pattern=pattern,
                target=target,
                repo_root=repo_root,
                detail_level=detail_level,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "search":
            try:
                kind = _pop_option(action_args, "--kind")
                limit = _pop_int_option(action_args, "--limit", 20)
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            query = " ".join(action_args).strip()
            if not query:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg search <query> [--kind Kind] [--limit N] [--repo <path>]",
                )
            result = crg_manager.semantic_search(
                query=query,
                kind=kind,
                limit=limit,
                repo_root=repo_root,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action in {"arch", "architecture"}:
            if action_args:
                return CommandExecutionResult(name="crg", text="Usage: /crg arch [--repo <path>]")
            result = crg_manager.get_architecture_overview(repo_root=repo_root)
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "flows":
            try:
                sort_by = _pop_option(action_args, "--sort") or "criticality"
                limit = _pop_int_option(action_args, "--limit", 50)
            except ValueError as e:
                return CommandExecutionResult(name="crg", text=str(e))
            if sort_by not in {"criticality", "depth", "node_count", "name"}:
                return CommandExecutionResult(
                    name="crg",
                    text="--sort must be one of: criticality, depth, node_count, name",
                )
            if action_args:
                return CommandExecutionResult(
                    name="crg",
                    text="Usage: /crg flows [--sort criticality|depth|node_count|name] [--limit N] [--repo <path>]",
                )
            result = crg_manager.list_flows(
                repo_root=repo_root,
                sort_by=sort_by,
                limit=limit,
            )
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        if action == "stats":
            if action_args:
                return CommandExecutionResult(name="crg", text="Usage: /crg stats [--repo <path>]")
            result = crg_manager.list_graph_stats(repo_root=repo_root)
            return CommandExecutionResult(name="crg", text=_pretty_json(result))

        return CommandExecutionResult(
            name="crg",
            text="Usage: /crg [status|build|detect|impact|review|query|search|arch|flows|stats|help]",
        )

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

        if action == "run":
            if len(args) < 2:
                return CommandExecutionResult(name="skills", text="Usage: /skills run <name>")
            payload = skill_registry.get_skill(args[1])
            if payload is None:
                return CommandExecutionResult(name="skills", text=f"Skill not found: {args[1]}")

            skill_name = str(payload.get("name", args[1]))
            skill_content = str(payload.get("content", "")).strip()
            if not skill_content:
                return CommandExecutionResult(name="skills", text=f"Skill is empty: {skill_name}")

            run_prompt = f"[Skill: {skill_name}]\n{skill_content}\n\nPlease execute this skill now."
            return CommandExecutionResult(
                name="skills",
                text=f"Running skill: {skill_name}",
                run_prompt=run_prompt,
            )

        return CommandExecutionResult(name="skills", text="Usage: /skills [list|show|run]")

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
