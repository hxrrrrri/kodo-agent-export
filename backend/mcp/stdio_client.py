import asyncio
import json
import os
import time
from typing import Any, Awaitable, Callable, TypeVar


MAX_MESSAGE_BYTES = 4 * 1024 * 1024
T = TypeVar("T")


class MCPClientError(RuntimeError):
    pass


class MCPTransportError(MCPClientError):
    pass


class MCPProtocolError(MCPClientError):
    pass


def _coerce_env(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        return {}

    out: dict[str, str] = {}
    for key, value in payload.items():
        k = str(key).strip()
        if not k:
            continue
        out[k] = str(value)
    return out


def _rpc_error_text(error: Any) -> str:
    if isinstance(error, dict):
        message = str(error.get("message", "Unknown MCP error"))
        code = error.get("code")
        if code is not None:
            return f"{message} (code {code})"
        return message
    return str(error)


class StdioMCPClient:
    def __init__(
        self,
        *,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        framing: str = "line",
    ) -> None:
        self.command = command.strip()
        self.args = [str(a) for a in (args or [])]
        self.env = dict(env or {})
        self.framing = framing
        self._next_id = 1
        self._proc: asyncio.subprocess.Process | None = None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

    async def start(self) -> None:
        if self._proc is not None and self._proc.returncode is None:
            return

        if not self.command:
            raise MCPTransportError("MCP command is required")

        env = os.environ.copy()
        env.update(self.env)

        try:
            self._proc = await asyncio.create_subprocess_exec(
                self.command,
                *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except Exception as e:
            raise MCPTransportError(
                f"Failed to start MCP process: {e!r} (command={self.command!r}, args={self.args!r})"
            ) from e

    async def close(self) -> None:
        if self._proc is None:
            return

        proc = self._proc
        self._proc = None

        if proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass

    def _ensure_running(self) -> asyncio.subprocess.Process:
        if self._proc is None:
            raise MCPTransportError("MCP process not started")
        if self._proc.returncode is not None:
            raise MCPTransportError(f"MCP process exited with code {self._proc.returncode}")
        return self._proc

    async def _send_message(self, payload: dict[str, Any]) -> None:
        proc = self._ensure_running()
        if proc.stdin is None:
            raise MCPTransportError("MCP stdin is not available")

        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        if self.framing == "content-length":
            header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
            proc.stdin.write(header + body)
        else:
            proc.stdin.write(body + b"\n")
        await proc.stdin.drain()

    async def _read_message(self, timeout_seconds: int) -> dict[str, Any]:
        if self.framing == "content-length":
            return await self._read_message_content_length(timeout_seconds)
        return await self._read_message_line(timeout_seconds)

    async def _read_message_line(self, timeout_seconds: int) -> dict[str, Any]:
        proc = self._ensure_running()
        if proc.stdout is None:
            raise MCPTransportError("MCP stdout is not available")

        deadline = time.monotonic() + timeout_seconds
        while True:
            raw_remaining = deadline - time.monotonic()
            if raw_remaining <= 0:
                raise TimeoutError()
            remaining = max(0.05, raw_remaining)

            raw = await asyncio.wait_for(proc.stdout.readline(), timeout=remaining)
            if raw == b"":
                stderr_text = await self._read_stderr_tail()
                raise MCPTransportError(
                    f"MCP process closed while reading line-framed message. stderr: {stderr_text or 'n/a'}"
                )

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                # Some servers emit startup notices; ignore non-JSON lines.
                continue

            if not isinstance(payload, dict):
                continue
            return payload

    async def _read_message_content_length(self, timeout_seconds: int) -> dict[str, Any]:
        proc = self._ensure_running()
        if proc.stdout is None:
            raise MCPTransportError("MCP stdout is not available")

        try:
            header_block = await asyncio.wait_for(
                proc.stdout.readuntil(b"\r\n\r\n"),
                timeout=timeout_seconds,
            )
        except asyncio.LimitOverrunError as e:
            raise MCPTransportError(f"Invalid MCP header framing: {e}") from e
        except asyncio.IncompleteReadError as e:
            stderr_text = await self._read_stderr_tail()
            raise MCPTransportError(
                f"MCP process closed while reading headers. stderr: {stderr_text or 'n/a'}"
            ) from e

        header_lines = header_block.decode("ascii", errors="replace").split("\r\n")
        content_length = None
        for line in header_lines:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            if key.strip().lower() == "content-length":
                try:
                    content_length = int(value.strip())
                except ValueError as e:
                    raise MCPTransportError("Invalid Content-Length header") from e

        if content_length is None:
            raise MCPTransportError("Missing Content-Length header")
        if content_length < 0 or content_length > MAX_MESSAGE_BYTES:
            raise MCPTransportError(f"MCP message too large: {content_length} bytes")

        try:
            body = await asyncio.wait_for(
                proc.stdout.readexactly(content_length),
                timeout=timeout_seconds,
            )
        except asyncio.IncompleteReadError as e:
            stderr_text = await self._read_stderr_tail()
            raise MCPTransportError(
                f"MCP process closed while reading body. stderr: {stderr_text or 'n/a'}"
            ) from e

        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as e:
            raise MCPProtocolError(f"Invalid JSON from MCP server: {e}") from e

        if not isinstance(payload, dict):
            raise MCPProtocolError("Unexpected non-object MCP payload")
        return payload

    async def _read_stderr_tail(self) -> str:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return ""

        try:
            chunk = await asyncio.wait_for(proc.stderr.read(4096), timeout=0.05)
        except Exception:
            return ""
        return chunk.decode("utf-8", errors="replace").strip()

    async def _reply_unsupported_client_method(self, request_payload: dict[str, Any]) -> None:
        req_id = request_payload.get("id")
        if req_id is None:
            return

        await self._send_message({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": -32601,
                "message": "Client method is not supported by KODO MCP runtime",
            },
        })

    async def request(self, method: str, params: dict[str, Any] | None = None, timeout_seconds: int = 15) -> Any:
        request_id = self._next_id
        self._next_id += 1

        await self._send_message({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        })

        while True:
            payload = await self._read_message(timeout_seconds)

            # Server-initiated request to client.
            if "method" in payload and "id" in payload:
                await self._reply_unsupported_client_method(payload)
                continue

            if payload.get("id") != request_id:
                # Notification or unrelated response.
                continue

            if "error" in payload and payload["error"] is not None:
                raise MCPProtocolError(_rpc_error_text(payload["error"]))

            return payload.get("result")

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        await self._send_message({
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
        })

    async def initialize(self, timeout_seconds: int = 10) -> dict[str, Any]:
        result = await self.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {
                    "name": "kodo-agent",
                    "version": "1.0.0",
                },
            },
            timeout_seconds=timeout_seconds,
        )

        if not isinstance(result, dict):
            raise MCPProtocolError("Invalid initialize response from MCP server")

        await self.notify("notifications/initialized", {})
        return result

    async def list_tools(self, timeout_seconds: int = 10) -> list[dict[str, Any]]:
        result = await self.request("tools/list", {}, timeout_seconds=timeout_seconds)
        if isinstance(result, dict):
            tools = result.get("tools", [])
        else:
            tools = result

        if not isinstance(tools, list):
            raise MCPProtocolError("tools/list returned unexpected payload")

        normalized: list[dict[str, Any]] = []
        for item in tools:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            normalized.append(item)
        return normalized

    async def call_tool(self, tool_name: str, arguments: dict[str, Any] | None = None, timeout_seconds: int = 20) -> Any:
        name = tool_name.strip()
        if not name:
            raise MCPProtocolError("tool_name is required")

        args = arguments or {}
        if not isinstance(args, dict):
            raise MCPProtocolError("arguments must be an object")

        return await self.request(
            "tools/call",
            {
                "name": name,
                "arguments": args,
            },
            timeout_seconds=timeout_seconds,
        )


async def list_tools_for_server(server: dict[str, Any], timeout_seconds: int = 8) -> list[dict[str, Any]]:
    command = str(server.get("command", "")).strip()
    if not command:
        raise ValueError("MCP server command is required")

    args_payload = server.get("args", [])
    args = [str(a) for a in args_payload] if isinstance(args_payload, list) else []

    env = _coerce_env(server.get("env", {}))

    if os.name == "nt":
        return await asyncio.to_thread(
            _run_coroutine_in_subprocess_capable_loop,
            lambda: _list_tools_with_retries(command, args, env, timeout_seconds),
        )
    return await _list_tools_with_retries(command, args, env, timeout_seconds)


def _run_coroutine_in_subprocess_capable_loop(factory: Callable[[], Awaitable[T]]) -> T:
    async def _runner() -> T:
        return await factory()

    if os.name == "nt" and hasattr(asyncio, "ProactorEventLoop"):
        loop = asyncio.ProactorEventLoop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(_runner())
        finally:
            loop.close()
            asyncio.set_event_loop(None)

    return asyncio.run(_runner())


async def _list_tools_with_retries(
    command: str,
    args: list[str],
    env: dict[str, str],
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for framing in ("line", "content-length"):
        try:
            async with StdioMCPClient(command=command, args=args, env=env, framing=framing) as client:
                await client.initialize(timeout_seconds=max(3, min(timeout_seconds, 20)))
                return await client.list_tools(timeout_seconds=max(3, min(timeout_seconds, 60)))
        except Exception as e:
            last_error = e

    if last_error is not None:
        raise MCPTransportError(f"Unable to list tools from MCP server: {last_error}")
    raise MCPTransportError("Unable to list tools from MCP server")


async def call_tool_for_server(
    server: dict[str, Any],
    *,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    timeout_seconds: int = 20,
) -> Any:
    command = str(server.get("command", "")).strip()
    if not command:
        raise ValueError("MCP server command is required")

    args_payload = server.get("args", [])
    args = [str(a) for a in args_payload] if isinstance(args_payload, list) else []

    env = _coerce_env(server.get("env", {}))

    if os.name == "nt":
        return await asyncio.to_thread(
            _run_coroutine_in_subprocess_capable_loop,
            lambda: _call_tool_with_retries(
                command,
                args,
                env,
                tool_name,
                arguments or {},
                timeout_seconds,
            ),
        )
    return await _call_tool_with_retries(
        command,
        args,
        env,
        tool_name,
        arguments or {},
        timeout_seconds,
    )


async def _call_tool_with_retries(
    command: str,
    args: list[str],
    env: dict[str, str],
    tool_name: str,
    arguments: dict[str, Any],
    timeout_seconds: int,
) -> Any:
    last_error: Exception | None = None
    for framing in ("line", "content-length"):
        try:
            async with StdioMCPClient(command=command, args=args, env=env, framing=framing) as client:
                await client.initialize(timeout_seconds=max(3, min(timeout_seconds, 20)))
                return await client.call_tool(
                    tool_name,
                    arguments=arguments,
                    timeout_seconds=max(3, min(timeout_seconds, 120)),
                )
        except Exception as e:
            last_error = e

    if last_error is not None:
        raise MCPTransportError(f"Unable to call MCP tool {tool_name}: {last_error}")
    raise MCPTransportError(f"Unable to call MCP tool {tool_name}")
