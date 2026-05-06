from __future__ import annotations

import shlex
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .capsule_manager import capsule_manager


class CapsuleCLI:
    def __init__(self, console: Console | None = None) -> None:
        self.console = console or Console()

    async def handle(self, command: str, *, session_id: str, project_dir: str | None = None) -> str:
        try:
            args = shlex.split(command)
            if not args or args[0] == "/capsule":
                return self.menu_text()
            if args[0] != "/cap":
                return "Capsule commands start with /cap or /capsule"
            action = args[1].lower() if len(args) > 1 else "list"
            if action == "save":
                tag = " ".join(args[2:]).strip() or None
                return await capsule_manager.capture_tool.cli_handler(session_id=session_id, tag=tag)
            if action == "inject":
                if len(args) < 3:
                    return "Usage: /cap inject <capsule_id>"
                return await capsule_manager.inject_tool.cli_handler(capsule_id=args[2])
            if action == "list":
                capsules = await capsule_manager.list_capsules()
                if not capsules:
                    return "No capsules saved yet."
                table = Table(title="Kodo Capsules")
                table.add_column("ID")
                table.add_column("Tag")
                table.add_column("Updated")
                for cap in capsules[:30]:
                    table.add_row(cap.id, cap.tag, cap.updated_at)
                with self.console.capture() as capture:
                    self.console.print(table)
                return capture.get()
            if action == "compress":
                return await capsule_manager.compress_tool.cli_handler(session_id=session_id, persist=True)
            if action == "usage":
                return await capsule_manager.usage_tool.cli_handler(session_id=session_id)
            if action == "bridge":
                if len(args) < 3:
                    return "Usage: /cap bridge <capsule_id> [provider]"
                return await capsule_manager.bridge_tool.cli_handler(capsule_id=args[2], target_provider=args[3] if len(args) > 3 else "openai")
            if action == "template":
                template = args[2] if len(args) > 2 else "bug_hunt"
                return await capsule_manager.template_tool.cli_handler(template=template, values={})
            if action == "persona":
                if len(args) < 3:
                    return "Usage: /cap persona <name>"
                return await capsule_manager.persona_tool.cli_handler(name=args[2], project_dir=project_dir)
            if action == "merge":
                if len(args) < 4:
                    return "Usage: /cap merge <id1> <id2> [id3...]"
                return await capsule_manager.merge_tool.cli_handler(capsule_ids=args[2:])
            if action == "export":
                path = args[2] if len(args) > 2 else None
                result = await capsule_manager.export(path=path, import_mode=False)
                return result.message
            if action == "rollback":
                if len(args) < 3:
                    return "Usage: /cap rollback <capsule_id> [version]"
                version = int(args[3]) if len(args) > 3 else None
                return await capsule_manager.rollback_tool.cli_handler(capsule_id=args[2], version_number=version)
            if action == "ok":
                return "Capsule alert dismissed for this CLI session."
            return self.menu_text()
        except Exception as exc:
            return f"Capsule command failed: {exc}"

    def menu_text(self) -> str:
        return "\n".join(
            [
                "Capsule commands:",
                "/cap save [tag]",
                "/cap inject <id>",
                "/cap list",
                "/cap compress",
                "/cap usage",
                "/cap bridge <id> [provider]",
                "/cap template [name]",
                "/cap persona <name>",
                "/cap merge <id1> <id2>",
                "/cap export [path]",
                "/cap rollback <id> [version]",
            ]
        )

    def warning_panel(self, payload: dict[str, Any]) -> Panel:
        title = "CAPSULE ALERT"
        reason = str(payload.get("alert_reason") or "Context is near its limit")
        context = float(payload.get("context_pct") or 0)
        rate = payload.get("rate_limit_pct")
        lines = [reason, "", f"Context: {context:.1f}%"]
        if rate is not None:
            lines.append(f"Rate limit: {float(rate):.1f}%")
        lines.extend(["", "Type /cap save to capture this session", "Type /cap compress to free space", "Type /cap ok to dismiss"])
        return Panel("\n".join(lines), title=title, border_style="red" if context >= 95 else "yellow")


capsule_cli = CapsuleCLI()
