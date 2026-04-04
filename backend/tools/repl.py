from __future__ import annotations

import asyncio
import contextlib
import io
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path

DANGEROUS_PATTERNS = [
    r"\bsubprocess\b",
    r"\bos\.system\b",
    r"\bexec\(",
    r"\beval\(",
    r"child_process",
    r"process\.exit\(",
]

NODE_RESULT_PREFIX = "__KODO_RESULT__"
NODE_BOOTSTRAP_SCRIPT = r"""
const vm = require('vm');
const readline = require('readline');

const context = vm.createContext({
  require,
  process,
  Buffer,
  setTimeout,
  setInterval,
  clearTimeout,
  clearInterval,
});

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch (err) {
    process.stdout.write(`__KODO_RESULT__${JSON.stringify({ ok: false, error: 'Invalid JSON request' })}\n`);
    return;
  }

    const writeLine = (text) => {
        process.stdout.write(String(text) + '\n');
    };
  context.console = {
        log: (...args) => writeLine(args.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')),
        error: (...args) => writeLine('[stderr] ' + args.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')),
  };

  const id = String(req.id ?? '');
  const code = String(req.code ?? '');

  try {
    const script = new vm.Script(code, { displayErrors: true });
    let value = script.runInContext(context);
    if (value && typeof value.then === 'function') {
      value = await value;
    }
    process.stdout.write(
        `__KODO_RESULT__${JSON.stringify({ id, ok: true, result: value === undefined ? null : value })}\n`,
    );
  } catch (err) {
    const error = err && err.stack ? String(err.stack) : String(err);
    process.stdout.write(
        `__KODO_RESULT__${JSON.stringify({ id, ok: false, error })}\n`,
    );
  }
});
""".strip()


@dataclass
class PythonSession:
    scope: dict[str, Any]
    last_used: float = field(default_factory=time.monotonic)


@dataclass
class NodeSession:
    process: asyncio.subprocess.Process
    cwd: str
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_used: float = field(default_factory=time.monotonic)


_PYTHON_SESSIONS: dict[str, PythonSession] = {}
_NODE_SESSIONS: dict[str, NodeSession] = {}
_REPL_CLEANUP_TASK: asyncio.Task[Any] | None = None


def _timeout_seconds() -> int:
    try:
        return max(10, int(os.getenv("REPL_SESSION_TIMEOUT_SECONDS", "300") or 300))
    except ValueError:
        return 300


def _session_key(session_id: str | None) -> str:
    key = (session_id or "default").strip()
    return key or "default"


class _ThreadSafeLineWriter(io.StringIO):
    def __init__(
        self,
        *,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue[str | None],
        prefix: str = "",
    ) -> None:
        super().__init__()
        self._loop = loop
        self._queue = queue
        self._prefix = prefix
        self._line_buffer = ""

    def write(self, value: str) -> int:
        written = super().write(value)
        self._line_buffer += value
        while "\n" in self._line_buffer:
            line, self._line_buffer = self._line_buffer.split("\n", 1)
            self._loop.call_soon_threadsafe(self._queue.put_nowait, f"{self._prefix}{line}".rstrip("\r"))
        return written

    def flush_partial_line(self) -> None:
        if not self._line_buffer:
            return
        self._loop.call_soon_threadsafe(
            self._queue.put_nowait,
            f"{self._prefix}{self._line_buffer}".rstrip("\r"),
        )
        self._line_buffer = ""


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


def _run_python_cell_stream(
    scope: dict[str, Any],
    code: str,
    *,
    loop: asyncio.AbstractEventLoop,
    queue: asyncio.Queue[str | None],
) -> tuple[str, str]:
    stdout_buffer = _ThreadSafeLineWriter(loop=loop, queue=queue)
    stderr_buffer = _ThreadSafeLineWriter(loop=loop, queue=queue, prefix="[stderr] ")

    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            try:
                compiled = compile(code, "<repl>", "eval")
                value = eval(compiled, scope)
                if value is not None:
                    print(repr(value))
            except SyntaxError:
                exec(compile(code, "<repl>", "exec"), scope)
    finally:
        stdout_buffer.flush_partial_line()
        stderr_buffer.flush_partial_line()
        loop.call_soon_threadsafe(queue.put_nowait, None)

    return stdout_buffer.getvalue(), stderr_buffer.getvalue()


async def _close_node_session(key: str) -> None:
    session = _NODE_SESSIONS.pop(key, None)
    if not session:
        return

    process = session.process
    if process.returncode is None:
        process.kill()
        with contextlib.suppress(Exception):
            await process.wait()


async def _cleanup_idle_sessions() -> None:
    while True:
        await asyncio.sleep(min(30, _timeout_seconds()))
        cutoff = time.monotonic() - _timeout_seconds()

        expired_python = [key for key, session in _PYTHON_SESSIONS.items() if session.last_used < cutoff]
        for key in expired_python:
            _PYTHON_SESSIONS.pop(key, None)

        expired_node = [key for key, session in _NODE_SESSIONS.items() if session.last_used < cutoff]
        for key in expired_node:
            await _close_node_session(key)


def _ensure_cleanup_loop() -> None:
    global _REPL_CLEANUP_TASK
    if _REPL_CLEANUP_TASK is not None and not _REPL_CLEANUP_TASK.done():
        return

    loop = asyncio.get_running_loop()
    _REPL_CLEANUP_TASK = loop.create_task(_cleanup_idle_sessions())


async def _ensure_node_session(key: str, cwd: str, reset: bool) -> NodeSession:
    if reset:
        await _close_node_session(key)

    existing = _NODE_SESSIONS.get(key)
    if existing and existing.process.returncode is None and existing.cwd == cwd:
        existing.last_used = time.monotonic()
        return existing

    if existing:
        await _close_node_session(key)

    process = await asyncio.create_subprocess_exec(
        "node",
        "-e",
        NODE_BOOTSTRAP_SCRIPT,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    session = NodeSession(process=process, cwd=cwd)
    _NODE_SESSIONS[key] = session
    return session


async def _read_node_response(
    session: NodeSession,
    timeout: int,
    on_output: Callable[[str], Awaitable[None]] | None = None,
) -> dict[str, Any]:
    if session.process.stdout is None:
        raise RuntimeError("Node REPL stdout is unavailable")

    passthrough: list[str] = []
    while True:
        line_bytes = await asyncio.wait_for(session.process.stdout.readline(), timeout=timeout)
        if not line_bytes:
            raise RuntimeError("Node REPL process terminated unexpectedly")

        line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
        if line.startswith(NODE_RESULT_PREFIX):
            raw = line[len(NODE_RESULT_PREFIX) :]
            payload = json.loads(raw)
            if passthrough and isinstance(payload, dict):
                existing = str(payload.get("stdout", ""))
                payload["stdout"] = "\n".join([*passthrough, existing]).strip("\n")
            return payload

        passthrough.append(line)
        if on_output is not None:
            try:
                await on_output(line)
            except Exception:
                pass


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
        on_output: Callable[[str], Awaitable[None]] | None = None,
        **kwargs,
    ) -> ToolResult:
        _ensure_cleanup_loop()

        lang = language.strip().lower()
        snippet = code.rstrip("\n")
        if not snippet.strip():
            return ToolResult(success=False, output="", error="code is required")

        timeout = max(1, min(int(timeout), 120))
        key = _session_key(session_id)

        if lang == "python":
            return await self._execute_python(key, snippet, reset=reset, timeout=timeout, on_output=on_output)
        if lang == "node":
            return await self._execute_node(key, snippet, reset=reset, timeout=timeout, cwd=cwd, on_output=on_output)

        return ToolResult(success=False, output="", error="language must be 'python' or 'node'")

    async def _execute_python(
        self,
        key: str,
        snippet: str,
        *,
        reset: bool,
        timeout: int,
        on_output: Callable[[str], Awaitable[None]] | None,
    ) -> ToolResult:
        if reset or key not in _PYTHON_SESSIONS:
            _PYTHON_SESSIONS[key] = PythonSession(
                scope={
                    "__name__": "__main__",
                    "__builtins__": __builtins__,
                }
            )

        session = _PYTHON_SESSIONS[key]
        session.last_used = time.monotonic()

        try:
            if on_output is None:
                stdout, stderr = await asyncio.wait_for(
                    asyncio.to_thread(_run_python_cell, session.scope, snippet),
                    timeout=timeout,
                )
            else:
                line_queue: asyncio.Queue[str | None] = asyncio.Queue()
                loop = asyncio.get_running_loop()

                python_task = asyncio.create_task(
                    asyncio.to_thread(
                        _run_python_cell_stream,
                        session.scope,
                        snippet,
                        loop=loop,
                        queue=line_queue,
                    )
                )
                deadline = loop.time() + timeout
                while True:
                    remaining = deadline - loop.time()
                    if remaining <= 0:
                        python_task.cancel()
                        raise asyncio.TimeoutError()

                    streamed_line = await asyncio.wait_for(line_queue.get(), timeout=remaining)
                    if streamed_line is None:
                        break
                    try:
                        await on_output(streamed_line)
                    except Exception:
                        pass

                stdout, stderr = await python_task
        except asyncio.TimeoutError:
            return ToolResult(success=False, output="", error=f"REPL execution timed out after {timeout}s")
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"Python REPL error: {exc}")

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
                "globals_count": len(session.scope),
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
        on_output: Callable[[str], Awaitable[None]] | None,
    ) -> ToolResult:
        try:
            effective_cwd = enforce_allowed_path(cwd or ".")
        except ValueError as exc:
            return ToolResult(success=False, output="", error=str(exc))

        if not os.path.isdir(effective_cwd):
            return ToolResult(success=False, output="", error=f"Working directory not found: {effective_cwd}")

        try:
            session = await _ensure_node_session(key, effective_cwd, reset)
        except FileNotFoundError:
            return ToolResult(success=False, output="", error="Node.js executable not found (node).")
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"Node REPL error: {exc}")

        payload = {
            "id": str(uuid.uuid4()),
            "code": snippet,
        }

        if session.process.stdin is None:
            return ToolResult(success=False, output="", error="Node REPL stdin is unavailable")

        try:
            async with session.lock:
                session.last_used = time.monotonic()
                session.process.stdin.write((json.dumps(payload, ensure_ascii=True) + "\n").encode("utf-8"))
                await session.process.stdin.drain()
                response = await _read_node_response(session, timeout, on_output=on_output)
                session.last_used = time.monotonic()
        except asyncio.TimeoutError:
            await _close_node_session(key)
            return ToolResult(success=False, output="", error=f"REPL execution timed out after {timeout}s")
        except json.JSONDecodeError:
            await _close_node_session(key)
            return ToolResult(success=False, output="", error="Invalid response from Node REPL")
        except Exception as exc:
            await _close_node_session(key)
            return ToolResult(success=False, output="", error=f"Node REPL error: {exc}")

        stdout = str(response.get("stdout", "") or "")
        result_value = response.get("result")
        if result_value is not None:
            if stdout:
                stdout += "\n"
            stdout += repr(result_value)

        if len(stdout) > 20000:
            stdout = stdout[:20000] + "\n... [output truncated]"

        ok = bool(response.get("ok", False))
        error_text = str(response.get("error", "") or "")

        return ToolResult(
            success=ok,
            output=stdout or "(no output)",
            error=None if ok else (error_text or "Node execution failed"),
            metadata={
                "language": "node",
                "session_id": key,
                "cwd": effective_cwd,
            },
        )
