import asyncio
import contextlib
import io
import os
import re
import subprocess
from typing import Any

from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path

_PYTHON_SESSIONS: dict[str, dict[str, Any]] = {}
_NODE_SESSIONS: dict[str, list[str]] = {}

DANGEROUS_PATTERNS = [
    r"\bsubprocess\b",
    r"\bos\.system\b",
    r"\bexec\(",
    r"\beval\(",
    r"child_process",
    r"process\.exit\(",
]


def _session_key(session_id: str | None) -> str:
    key = (session_id or "default").strip()
    return key or "default"


def _run_python_cell(scope: dict[str, Any], code: str) -> tuple[str, str]:
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()

    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
        try:
            compiled = compile(code, "<repl>", "eval")
            value = eval(compiled, scope)
            if value is not None:
                print(repr(value))
        except SyntaxError:
            exec(compile(code, "<repl>", "exec"), scope)

    return stdout_buffer.getvalue(), stderr_buffer.getvalue()


class ReplTool(BaseTool):
    name = "repl"
    description = (
        "Execute snippets in a lightweight REPL session. Supports python and node "
        "with optional session persistence via session_id."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "language": {
                "type": "string",
                "description": "REPL language: python or node",
                "enum": ["python", "node"],
            },
            "code": {
                "type": "string",
                "description": "Code snippet to execute",
            },
            "session_id": {
                "type": "string",
                "description": "Optional REPL session key for state persistence",
            },
            "reset": {
                "type": "boolean",
                "description": "Reset the REPL session before executing",
                "default": False,
            },
            "timeout": {
                "type": "integer",
                "description": "Execution timeout in seconds (default 20, max 120)",
                "default": 20,
            },
            "cwd": {
                "type": "string",
                "description": "Working directory for node execution (optional)",
            },
        },
        "required": ["language", "code"],
    }

    def prompt(self) -> str:
        return (
            "Use for short iterative code experiments and stateful snippet execution. "
            "Prefer this over writing temporary files for quick checks."
        )

    def is_dangerous(self, code: str = "", **kwargs) -> bool:
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, code, re.IGNORECASE):
                return True
        return False

    async def execute(
        self,
        language: str,
        code: str,
        session_id: str | None = None,
        reset: bool = False,
        timeout: int = 20,
        cwd: str | None = None,
        **kwargs,
    ) -> ToolResult:
        lang = language.strip().lower()
        snippet = code.rstrip("\n")
        if not snippet.strip():
            return ToolResult(success=False, output="", error="code is required")

        timeout = max(1, min(int(timeout), 120))
        key = _session_key(session_id)

        if lang == "python":
            return await self._execute_python(key, snippet, reset=reset, timeout=timeout)
        if lang == "node":
            return await self._execute_node(key, snippet, reset=reset, timeout=timeout, cwd=cwd)

        return ToolResult(success=False, output="", error="language must be 'python' or 'node'")

    async def _execute_python(self, key: str, snippet: str, *, reset: bool, timeout: int) -> ToolResult:
        if reset or key not in _PYTHON_SESSIONS:
            _PYTHON_SESSIONS[key] = {
                "__name__": "__main__",
                "__builtins__": __builtins__,
            }

        scope = _PYTHON_SESSIONS[key]
        try:
            stdout, stderr = await asyncio.wait_for(
                asyncio.to_thread(_run_python_cell, scope, snippet),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error=f"REPL execution timed out after {timeout}s")
        except Exception as e:
            return ToolResult(success=False, output="", error=f"Python REPL error: {e}")

        combined = stdout
        if stderr:
            combined += f"\n[stderr]\n{stderr}" if stdout else stderr

        if len(combined) > 20000:
            combined = combined[:20000] + "\n... [output truncated]"

        return ToolResult(
            success=True,
            output=combined or "(no output)",
            metadata={
                "language": "python",
                "session_id": key,
                "globals_count": len(scope),
            },
        )

    async def _execute_node(
        self,
        key: str,
        snippet: str,
        *,
        reset: bool,
        timeout: int,
        cwd: str | None,
    ) -> ToolResult:
        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as e:
            return ToolResult(success=False, output="", error=str(e))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        if reset or key not in _NODE_SESSIONS:
            _NODE_SESSIONS[key] = []

        history = _NODE_SESSIONS[key]
        history.append(snippet)
        script = "\n".join(history)

        try:
            proc = await asyncio.create_subprocess_exec(
                "node",
                "-e",
                script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=effective_cwd,
            )
        except FileNotFoundError:
            history.pop()
            return ToolResult(success=False, output="", error="Node.js executable not found (node).")
        except NotImplementedError:
            proc = None
        except Exception as e:
            history.pop()
            msg = str(e).strip() or e.__class__.__name__
            return ToolResult(success=False, output="", error=f"Node REPL error: {msg}")

        try:
            if proc is not None:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                return_code = proc.returncode
            else:
                completed = await asyncio.to_thread(
                    subprocess.run,
                    ["node", "-e", script],
                    capture_output=True,
                    cwd=effective_cwd,
                    timeout=timeout,
                )
                stdout = completed.stdout or b""
                stderr = completed.stderr or b""
                return_code = completed.returncode
        except asyncio.TimeoutError:
            if proc is not None:
                proc.kill()
                await proc.wait()
            history.pop()
            return ToolResult(success=False, output="", error=f"REPL execution timed out after {timeout}s")
        except subprocess.TimeoutExpired:
            history.pop()
            return ToolResult(success=False, output="", error=f"REPL execution timed out after {timeout}s")

        if return_code != 0:
            history.pop()

        out = stdout.decode("utf-8", errors="replace")
        err = stderr.decode("utf-8", errors="replace")

        combined = out
        if err:
            combined += f"\n[stderr]\n{err}" if out else err

        if len(combined) > 20000:
            combined = combined[:20000] + "\n... [output truncated]"

        return ToolResult(
            success=return_code == 0,
            output=combined or "(no output)",
            error=None if return_code == 0 else f"Exit code: {return_code}",
            metadata={
                "language": "node",
                "session_id": key,
                "cwd": effective_cwd,
                "history_size": len(history),
            },
        )
