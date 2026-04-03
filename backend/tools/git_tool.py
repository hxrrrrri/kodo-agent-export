from __future__ import annotations

import asyncio
import os
import shlex
from typing import Sequence

from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path


def _tokens(command: str) -> list[str]:
    parts = shlex.split(command)
    if parts and parts[0].lower() == "git":
        return parts[1:]
    return parts


def _starts_with(parts: Sequence[str], prefix: Sequence[str]) -> bool:
    if len(parts) < len(prefix):
        return False
    return [p.lower() for p in parts[: len(prefix)]] == [p.lower() for p in prefix]


def _is_blocked(parts: list[str]) -> bool:
    blocked_prefixes = [
        ["push"],
        ["fetch"],
        ["pull"],
        ["clone"],
        ["gc"],
        ["repack"],
        ["filter-branch"],
        ["format-patch"],
        ["send-email"],
        ["credential"],
        ["clean", "-f"],
        ["remote", "set-url"],
        ["reset", "--hard"],
        ["reset", "--mixed"],
        ["rebase", "--exec"],
        ["bisect"],
        ["config", "--global"],
        ["config", "--system"],
    ]
    for prefix in blocked_prefixes:
        if _starts_with(parts, prefix):
            return True
    return False


def _is_allowed(parts: list[str]) -> bool:
    if not parts:
        return False

    first = parts[0].lower()
    if first in {
        "status",
        "log",
        "diff",
        "show",
        "blame",
        "branch",
        "tag",
        "describe",
        "shortlog",
        "rev-parse",
        "ls-files",
        "ls-tree",
        "count-objects",
        "verify-commit",
        "verify-tag",
        "check-ignore",
    }:
        return True

    if first == "stash":
        return len(parts) >= 2 and parts[1].lower() == "list"

    if first == "remote":
        return len(parts) >= 2 and parts[1].lower() == "-v"

    if first == "cat-file":
        return len(parts) >= 2 and parts[1].lower() in {"-t", "-p"}

    if first == "notes":
        return len(parts) >= 2 and parts[1].lower() == "list"

    return False


class GitTool(BaseTool):
    name = "git_run"
    description = (
        "Run a git command in the project directory. Supports: status, log, diff, "
        "branch, show, blame, stash list, remote -v, tag. Does NOT support: push, "
        "force-push, reset --hard, or any command that modifies remote state."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "The git subcommand and flags (e.g. 'status', 'log --oneline -10', 'diff HEAD~1')",
            },
            "cwd": {
                "type": "string",
                "description": "Working directory. Defaults to the session project_dir.",
            },
        },
        "required": ["command"],
    }

    async def execute(self, command: str, cwd: str | None = None, **kwargs) -> ToolResult:
        normalized = (command or "").strip()
        if not normalized:
            return ToolResult(success=False, output="", error="command is required")

        try:
            parts = _tokens(normalized)
        except ValueError as exc:
            return ToolResult(success=False, output="", error=f"Invalid command syntax: {exc}")

        if not parts:
            return ToolResult(success=False, output="", error="git subcommand is required")

        if _is_blocked(parts):
            return ToolResult(success=False, output="", error="Blocked git command for safety")

        if not _is_allowed(parts):
            return ToolResult(success=False, output="", error="Unsupported git command. Only read-oriented commands are allowed")

        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as exc:
            return ToolResult(success=False, output="", error=str(exc))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        try:
            proc = await asyncio.create_subprocess_exec(
                "git",
                *parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=10)
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error="git command timed out after 10s")
        except FileNotFoundError:
            return ToolResult(success=False, output="", error="git executable not found")
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"git execution failed: {exc}")

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        combined = stdout
        if stderr:
            combined = f"{stdout}\n\n[stderr]\n{stderr}" if stdout else stderr
        if not combined:
            combined = "(no output)"

        return ToolResult(
            success=proc.returncode == 0,
            output=combined,
            error=None if proc.returncode == 0 else f"Exit code: {proc.returncode}",
            metadata={
                "cwd": effective_cwd,
                "command": "git " + " ".join(parts),
                "exit_code": proc.returncode,
            },
        )
