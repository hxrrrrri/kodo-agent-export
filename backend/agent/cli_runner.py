from __future__ import annotations

import asyncio
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any


CLI_PROVIDER_CANDIDATES: dict[str, list[str]] = {
    "claude-cli": ["claude", "openclaude"],
    "codex-cli": ["codex"],
    "gemini-cli": ["gemini"],
    "copilot-cli": ["gh", "copilot"],
}

CLI_PROVIDER_MAP: dict[str, str] = {
    provider_id: candidates[0]
    for provider_id, candidates in CLI_PROVIDER_CANDIDATES.items()
}

CLI_PROVIDER_IDS = set(CLI_PROVIDER_CANDIDATES)

CLI_DEFAULT_MODEL = "default"
_STALE_API_MODEL_DEFAULTS = {
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "deepseek-chat",
    "llama-3.3-70b-versatile",
    "llama3",
    "meta/llama-3.1-8b-instruct",
}

_GEMINI_MODEL_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
)
CLI_PROVIDER_MODEL_FALLBACKS: dict[str, tuple[str, ...]] = {
    "claude-cli": (
        CLI_DEFAULT_MODEL,
        "claude-sonnet-4-6",
        "claude-opus-4-1",
    ),
    "codex-cli": (
        CLI_DEFAULT_MODEL,
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.3-codex",
        "gpt-5.2",
    ),
    "gemini-cli": (
        CLI_DEFAULT_MODEL,
        *_GEMINI_MODEL_FALLBACKS,
    ),
    "copilot-cli": (
        CLI_DEFAULT_MODEL,
        "gpt-5.3-codex",
    ),
}
_GEMINI_NOISE_PREFIXES = (
    "Warning: 256-color support not detected.",
    "YOLO mode is enabled.",
    "Ripgrep is not available.",
)

CLI_PROVIDER_ENV_PATHS: dict[str, str] = {
    "claude-cli": "KODO_CLAUDE_CLI_PATH",
    "codex-cli": "KODO_CODEX_CLI_PATH",
    "gemini-cli": "KODO_GEMINI_CLI_PATH",
    "copilot-cli": "KODO_COPILOT_CLI_PATH",
}

CLI_PROVIDER_EXTENSION_IDS: dict[str, list[str]] = {
    "claude-cli": ["anthropic.claude-code"],
    "codex-cli": ["openai.chatgpt"],
    "gemini-cli": ["google.geminicodeassist"],
    "copilot-cli": ["github.copilot", "github.copilot-chat"],
}


def cli_path(provider_id: str) -> str | None:
    """Return the first matching CLI executable on PATH."""
    override = os.getenv(CLI_PROVIDER_ENV_PATHS.get(provider_id, ""), "").strip().strip("'\"")
    if override and Path(override).is_file():
        return override

    extension_candidates = _extension_binary_candidates(provider_id)
    if provider_id == "codex-cli":
        path_candidates: list[str] = []
        for exe in CLI_PROVIDER_CANDIDATES.get(provider_id, []):
            resolved = shutil.which(exe)
            if resolved:
                path_candidates.append(resolved)
                if _codex_cli_is_modern(resolved):
                    return resolved
        if extension_candidates:
            return extension_candidates[0]
        if path_candidates:
            return path_candidates[0]

    for exe in CLI_PROVIDER_CANDIDATES.get(provider_id, []):
        resolved = shutil.which(exe)
        if not resolved:
            continue
        if provider_id == "copilot-cli" and exe == "gh" and not _gh_copilot_available(resolved):
            continue
        if resolved:
            return resolved

    for candidate in extension_candidates:
        if provider_id == "copilot-cli" and Path(candidate).name.lower().startswith("gh") and not _gh_copilot_available(candidate):
            continue
        return candidate
    return None


def _codex_cli_is_modern(exe: str) -> bool:
    version = _codex_cli_version(exe)
    if version is None:
        return False
    return version >= (0, 128, 0)


def _codex_cli_version(exe: str) -> tuple[int, int, int] | None:
    try:
        command: str | list[str] = [exe, "--version"]
        if _requires_shell_invocation(exe):
            command = subprocess.list2cmdline(command)
        result = subprocess.run(
            command,
            shell=_requires_shell_invocation(exe),
            capture_output=True,
            text=True,
            timeout=5,
        )
        text = (result.stdout or "") + "\n" + (result.stderr or "")
    except Exception:
        return None
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def cli_available(provider_id: str) -> bool:
    return cli_path(provider_id) is not None


def normalize_cli_model(
    provider_id: str,
    model: Any,
    *,
    available_models: list[str] | tuple[str, ...] | None = None,
) -> str:
    """Keep stale API/OpenRouter model ids from being passed to local CLIs."""
    value = str(model or "").strip().strip("'\"")
    if not value or value.lower() in {"default", "none", "null", "undefined"}:
        return CLI_DEFAULT_MODEL

    if provider_id not in CLI_PROVIDER_IDS:
        return value

    lowered = value.lower()
    if lowered in _STALE_API_MODEL_DEFAULTS or "/" in value:
        return CLI_DEFAULT_MODEL

    allowed_map = {
        str(item).strip().lower(): str(item).strip()
        for item in (available_models or ())
        if str(item).strip()
    }
    if lowered in allowed_map:
        return allowed_map[lowered]

    if provider_id == "claude-cli":
        return value if lowered.startswith("claude-") else CLI_DEFAULT_MODEL
    if provider_id == "gemini-cli":
        return value if lowered.startswith("gemini-") else CLI_DEFAULT_MODEL
    if provider_id in {"codex-cli", "copilot-cli"}:
        return value if lowered.startswith("gpt-") else CLI_DEFAULT_MODEL

    return value


def list_cli_models(provider_id: str) -> list[str]:
    normalized_provider = str(provider_id or "").strip().lower()
    if normalized_provider not in CLI_PROVIDER_IDS:
        return [CLI_DEFAULT_MODEL]

    fallback = list(CLI_PROVIDER_MODEL_FALLBACKS.get(normalized_provider, (CLI_DEFAULT_MODEL,)))
    discovered = _discover_cli_models(normalized_provider)
    return _dedupe_model_names([CLI_DEFAULT_MODEL, *discovered, *fallback])


def _discover_cli_models(provider_id: str) -> list[str]:
    exe = cli_path(provider_id)
    if not exe:
        return []

    discovered: list[str] = []
    for args in _cli_model_probe_commands(provider_id, exe):
        output = _run_cli_probe(args)
        if not output:
            continue
        discovered.extend(_extract_cli_models_from_output(provider_id, output))
    return _dedupe_model_names(discovered)


def _cli_model_probe_commands(provider_id: str, exe: str) -> list[list[str]]:
    if provider_id == "claude-cli":
        commands = [
            [exe, "--help"],
            [exe, "models", "--help"],
            [exe, "models", "list"],
        ]
        return _dedupe_command_rows(commands)

    if provider_id == "codex-cli":
        commands = [
            [exe, "--help"],
            [exe, "exec", "--help"],
            [exe, "models", "--help"],
            [exe, "models", "list"],
        ]
        return _dedupe_command_rows(commands)

    if provider_id == "gemini-cli":
        commands = [
            [exe, "--help"],
            [exe, "models", "--help"],
            [exe, "models", "list"],
            [exe, "list-models"],
        ]
        return _dedupe_command_rows(commands)

    if provider_id == "copilot-cli":
        base = Path(exe).name.lower()
        if base.startswith("gh"):
            commands = [
                [exe, "copilot", "--help"],
                [exe, "copilot", "chat", "--help"],
                [exe, "copilot", "models", "--help"],
            ]
        else:
            commands = [
                [exe, "--help"],
                [exe, "chat", "--help"],
                [exe, "models", "--help"],
            ]
        return _dedupe_command_rows(commands)

    return []


def _run_cli_probe(args: list[str]) -> str:
    try:
        command: str | list[str] = args
        if _requires_shell_invocation(args[0]):
            command = subprocess.list2cmdline(args)
        result = subprocess.run(
            command,
            shell=_requires_shell_invocation(args[0]),
            capture_output=True,
            text=True,
            timeout=4,
        )
    except Exception:
        return ""
    return ((result.stdout or "") + "\n" + (result.stderr or "")).strip()


def _extract_cli_models_from_output(provider_id: str, output: str) -> list[str]:
    text = str(output or "")
    if not text.strip():
        return []

    if provider_id == "claude-cli":
        pattern = r"\bclaude-[a-z0-9][a-z0-9.-]*\b"
    elif provider_id == "gemini-cli":
        pattern = r"\bgemini-[a-z0-9][a-z0-9.-]*\b"
    elif provider_id in {"codex-cli", "copilot-cli"}:
        pattern = r"\bgpt-\d+(?:\.\d+)?(?:-[a-z0-9]+)*\b"
    else:
        return []

    matches = [m.group(0) for m in re.finditer(pattern, text.lower())]
    return _dedupe_model_names(matches)


def _dedupe_command_rows(commands: list[list[str]]) -> list[list[str]]:
    seen: set[tuple[str, ...]] = set()
    out: list[list[str]] = []
    for command in commands:
        row = tuple(command)
        if row in seen:
            continue
        seen.add(row)
        out.append(list(command))
    return out


def _dedupe_model_names(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in values:
        value = str(raw or "").strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def cli_status(provider_id: str) -> dict[str, Any]:
    """Return executable and VS Code extension diagnostics for a local provider."""
    path = cli_path(provider_id)
    extension = vscode_extension_status(provider_id)
    return {
        "available": path is not None,
        "exe": CLI_PROVIDER_CANDIDATES.get(provider_id, [""])[0],
        "candidates": CLI_PROVIDER_CANDIDATES.get(provider_id, []),
        "env_path": CLI_PROVIDER_ENV_PATHS.get(provider_id),
        "path": path,
        "extension": extension,
        "message": _cli_status_message(provider_id, path, extension),
    }


def vscode_extension_status(provider_id: str) -> dict[str, Any]:
    installed = _installed_extension_dirs(CLI_PROVIDER_EXTENSION_IDS.get(provider_id, []))
    runnable_paths = _extension_binary_candidates(provider_id)
    data: dict[str, Any] = {
        "installed": bool(installed),
        "ids": CLI_PROVIDER_EXTENSION_IDS.get(provider_id, []),
        "paths": installed,
        "runnable": bool(runnable_paths),
        "runnable_paths": runnable_paths,
        "note": None,
    }

    if provider_id == "gemini-cli" and installed and not runnable_paths:
        bundled = _gemini_cloudcode_zip(installed[0])
        data["bundled_path"] = bundled
        data["note"] = (
            "Gemini Code Assist is installed, but its bundled cloudcode_cli is a language server, "
            "not a headless prompt CLI. Install the standalone gemini CLI or set KODO_GEMINI_CLI_PATH."
        )
    elif provider_id == "copilot-cli" and installed and not runnable_paths:
        data["note"] = (
            "GitHub Copilot for VS Code is installed, but VS Code Copilot does not expose a "
            "headless prompt CLI. Install gh with gh-copilot or set KODO_COPILOT_CLI_PATH."
        )
    elif provider_id == "copilot-cli" and not installed:
        data["note"] = (
            "GitHub Copilot for VS Code was not found in this VS Code profile. "
            "Install GitHub Copilot or use gh-copilot/copilot on PATH."
        )
    return data


def _cli_status_message(provider_id: str, path: str | None, extension: dict[str, Any]) -> str:
    if path:
        return f"Ready: {path}"
    note = extension.get("note")
    if isinstance(note, str) and note:
        return note
    env_key = CLI_PROVIDER_ENV_PATHS.get(provider_id)
    candidates = ", ".join(CLI_PROVIDER_CANDIDATES.get(provider_id, []))
    return f"Install one of [{candidates}] on PATH or set {env_key}."


def _vscode_extensions_root() -> Path:
    override = os.getenv("KODO_VSCODE_EXTENSIONS_DIR", "").strip().strip("'\"")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".vscode" / "extensions"


def _installed_extension_dirs(extension_ids: list[str]) -> list[str]:
    root = _vscode_extensions_root()
    if not root.exists():
        return []

    matches: list[Path] = []
    for extension_id in extension_ids:
        pattern = str(root / f"{extension_id}-*")
        matches.extend(Path(path) for path in glob.glob(pattern) if Path(path).is_dir())

    matches = sorted(matches, key=lambda path: path.stat().st_mtime, reverse=True)
    return [str(path) for path in matches]


def _extension_binary_candidates(provider_id: str) -> list[str]:
    paths: list[str] = []
    installed = _installed_extension_dirs(CLI_PROVIDER_EXTENSION_IDS.get(provider_id, []))

    if provider_id == "claude-cli":
        for root in installed:
            paths.extend(_existing_files([
                Path(root) / "resources" / "native-binary" / _windows_exe("claude"),
                Path(root) / "resources" / "native-binary" / "claude",
            ]))
    elif provider_id == "codex-cli":
        platform_dir = "windows-x86_64" if sys.platform == "win32" else ""
        for root in installed:
            candidates = []
            if platform_dir:
                candidates.append(Path(root) / "bin" / platform_dir / _windows_exe("codex"))
            candidates.extend(Path(match) for match in glob.glob(str(Path(root) / "bin" / "**" / _windows_exe("codex")), recursive=True))
            if sys.platform != "win32":
                candidates.extend(Path(match) for match in glob.glob(str(Path(root) / "bin" / "**" / "codex"), recursive=True))
            paths.extend(_existing_files(candidates))
    elif provider_id == "copilot-cli":
        # The VS Code Copilot extension does not currently expose a prompt CLI.
        return []
    elif provider_id == "gemini-cli":
        # Gemini Code Assist bundles cloudcode_cli, which is a language server, not a prompt CLI.
        return []

    seen: set[str] = set()
    unique: list[str] = []
    for path in paths:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique


def _windows_exe(name: str) -> str:
    return f"{name}.exe" if sys.platform == "win32" else name


def _existing_files(candidates: list[Path]) -> list[str]:
    return [str(path) for path in candidates if path.is_file()]


def _gemini_cloudcode_zip(extension_root: str) -> str | None:
    candidate = Path(extension_root) / "cloudcode_cli.zip"
    return str(candidate) if candidate.is_file() else None


def _gh_copilot_available(exe: str) -> bool:
    try:
        result = subprocess.run(
            [exe, "copilot", "--help"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return result.returncode == 0
    except Exception:
        return False


async def _read_stderr(proc: asyncio.subprocess.Process) -> str:
    if proc.stderr is None:
        return ""
    chunks: list[str] = []
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        chunks.append(line.decode("utf-8", errors="replace"))
    return "".join(chunks).strip()


async def _spawn_and_stream_lines(
    args: list[str],
    prompt: str,
    cwd: str | None = None,
    env: dict[str, str | None] | None = None,
    yield_stderr_on_success: bool = False,
    write_prompt_to_stdin: bool = True,
) -> AsyncGenerator[dict[str, Any], None]:
    run_env = _merged_env(env)
    try:
        if _requires_shell_invocation(args[0]):
            proc = await asyncio.create_subprocess_shell(
                subprocess.list2cmdline(args),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=run_env,
            )
        else:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=run_env,
            )
    except FileNotFoundError:
        yield {"_error": f"CLI not found: {args[0]}. Install it and ensure it is on PATH."}
        return
    except Exception as exc:
        yield {"_error": str(exc)}
        return

    stderr_task = asyncio.create_task(_read_stderr(proc))

    if proc.stdin is not None:
        try:
            if write_prompt_to_stdin:
                proc.stdin.write((prompt + "\n").encode("utf-8"))
                await proc.stdin.drain()
            proc.stdin.close()
        except (BrokenPipeError, ConnectionResetError):
            pass

    if proc.stdout is not None:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip("\n").strip()
            if not decoded:
                continue
            try:
                payload = json.loads(decoded)
            except json.JSONDecodeError:
                yield {"_raw_text": decoded}
            else:
                yield payload if isinstance(payload, dict) else {"_raw_text": decoded}

    return_code = await proc.wait()
    stderr_text = await stderr_task
    if return_code != 0:
        message = stderr_text or f"{args[0]} exited with code {return_code}"
        yield {"_error": message}
    elif yield_stderr_on_success and stderr_text:
        yield {"_stderr": stderr_text}


async def _spawn_shell_pipe_and_stream_lines(
    args: list[str],
    prompt: str,
    cwd: str | None = None,
    env: dict[str, str | None] | None = None,
    yield_stderr_on_success: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    fd, prompt_path = tempfile.mkstemp(prefix="kodo-codex-prompt-", suffix=".txt")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", errors="replace") as handle:
            handle.write(prompt)
            handle.write("\n")
        command = f"type {subprocess.list2cmdline([prompt_path])} | {subprocess.list2cmdline(args)}"
        async for event in _spawn_shell_command_and_stream_lines(command, cwd, env, yield_stderr_on_success):
            yield event
    finally:
        try:
            Path(prompt_path).unlink(missing_ok=True)
        except Exception:
            pass


async def _spawn_shell_command_and_stream_lines(
    command: str,
    cwd: str | None = None,
    env: dict[str, str | None] | None = None,
    yield_stderr_on_success: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    run_env = _merged_env(env)
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=run_env,
        )
    except Exception as exc:
        yield {"_error": str(exc)}
        return

    stderr_task = asyncio.create_task(_read_stderr(proc))

    if proc.stdout is not None:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip("\n").strip()
            if not decoded:
                continue
            try:
                payload = json.loads(decoded)
            except json.JSONDecodeError:
                yield {"_raw_text": decoded}
            else:
                yield payload if isinstance(payload, dict) else {"_raw_text": decoded}

    return_code = await proc.wait()
    stderr_text = await stderr_task
    if return_code != 0:
        yield {"_error": stderr_text or f"Codex shell adapter exited with code {return_code}"}
    elif yield_stderr_on_success and stderr_text:
        yield {"_stderr": stderr_text}


async def _spawn_console_capture_and_stream_lines(
    args: list[str],
    prompt: str,
    cwd: str | None = None,
    env: dict[str, str | None] | None = None,
    yield_stderr_on_success: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    result = await asyncio.to_thread(_run_console_capture, args, prompt, cwd, env)
    for decoded in result.get("stdout", "").splitlines():
        decoded = decoded.strip()
        if not decoded:
            continue
        try:
            payload = json.loads(decoded)
        except json.JSONDecodeError:
            yield {"_raw_text": decoded}
        else:
            yield payload if isinstance(payload, dict) else {"_raw_text": decoded}
    stderr_text = result.get("stderr", "")
    if int(result.get("return_code", 0)) != 0:
        yield {"_error": stderr_text or f"{args[0]} exited with code {result.get('return_code')}"}
    elif yield_stderr_on_success and stderr_text:
        yield {"_stderr": stderr_text}


async def _spawn_blocking_capture_and_stream_lines(
    args: list[str],
    prompt: str,
    cwd: str | None = None,
    env: dict[str, str | None] | None = None,
    yield_stderr_on_success: bool = False,
    write_prompt_to_stdin: bool = True,
) -> AsyncGenerator[dict[str, Any], None]:
    result = await asyncio.to_thread(_run_blocking_capture, args, prompt, cwd, env, write_prompt_to_stdin)
    for decoded in result.get("stdout", "").splitlines():
        decoded = decoded.strip()
        if not decoded:
            continue
        try:
            payload = json.loads(decoded)
        except json.JSONDecodeError:
            yield {"_raw_text": decoded}
        else:
            yield payload if isinstance(payload, dict) else {"_raw_text": decoded}
    stderr_text = result.get("stderr", "")
    if int(result.get("return_code", 0)) != 0:
        yield {"_error": stderr_text or f"{args[0]} exited with code {result.get('return_code')}"}
    elif yield_stderr_on_success and stderr_text:
        yield {"_stderr": stderr_text}


def _run_blocking_capture(
    args: list[str],
    prompt: str,
    cwd: str | None,
    env: dict[str, str | None] | None,
    write_prompt_to_stdin: bool,
) -> dict[str, Any]:
    shell = _requires_shell_invocation(args[0])
    command: str | list[str] = subprocess.list2cmdline(args) if shell else args
    completed = subprocess.run(
        command,
        input=(prompt + "\n") if write_prompt_to_stdin else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=cwd,
        env=_merged_env(env),
        shell=shell,
        timeout=300,
    )
    return {
        "return_code": completed.returncode,
        "stdout": completed.stdout or "",
        "stderr": completed.stderr or "",
    }


def _run_console_capture(
    args: list[str],
    prompt: str,
    cwd: str | None,
    env: dict[str, str | None] | None,
) -> dict[str, Any]:
    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0) if sys.platform == "win32" else 0
    completed = subprocess.run(
        args,
        input=prompt + "\n",
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=cwd,
        env=_merged_env(env),
        creationflags=creationflags,
        timeout=300,
    )
    return {
        "return_code": completed.returncode,
        "stdout": completed.stdout or "",
        "stderr": completed.stderr or "",
    }


def _merged_env(overrides: dict[str, str | None] | None = None) -> dict[str, str]:
    run_env = dict(os.environ)
    for key, value in (overrides or {}).items():
        if value is None:
            run_env.pop(key, None)
        else:
            run_env[key] = value
    return run_env


def _requires_shell_invocation(executable: str) -> bool:
    if sys.platform != "win32":
        return False
    return Path(str(executable)).suffix.lower() in {".cmd", ".bat"}


def _safe_json_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return str(value)


def _normalize_tool_input(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        return {"input": value}
    return {}


def _format_usage(raw_usage: Any, model: str | None = None) -> dict[str, Any]:
    usage = raw_usage if isinstance(raw_usage, dict) else {}
    formatted: dict[str, Any] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "model": model or "default",
    }

    input_keys = ("input_tokens", "prompt_tokens", "inputTokens")
    output_keys = ("output_tokens", "completion_tokens", "outputTokens")
    cache_read_keys = ("cached_input_tokens", "cached_read_tokens", "cacheReadTokens")
    cache_write_keys = ("cache_creation_input_tokens", "cached_write_tokens", "cacheWriteTokens")

    for key in input_keys:
        if isinstance(usage.get(key), (int, float)):
            formatted["input_tokens"] = int(usage[key])
            break
    for key in output_keys:
        if isinstance(usage.get(key), (int, float)):
            formatted["output_tokens"] = int(usage[key])
            break
    for key in cache_read_keys:
        if isinstance(usage.get(key), (int, float)):
            formatted["input_cache_read_tokens"] = int(usage[key])
            break
    for key in cache_write_keys:
        if isinstance(usage.get(key), (int, float)):
            formatted["input_cache_write_tokens"] = int(usage[key])
            break

    return formatted


async def run_claude_cli(
    prompt: str,
    model: str | None = None,
    cwd: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    exe = cli_path("claude-cli") or "claude"
    normalized_model = _normalize_provider_model("claude-cli", model)
    model_sequence: list[str | None] = []
    if normalized_model != CLI_DEFAULT_MODEL:
        model_sequence.append(normalized_model)
    model_sequence.append(None)

    attempts: list[dict[str, Any]] = []
    for model_name in model_sequence:
        attempts.extend(_build_claude_attempts(exe, model_name))

    async for event in _run_cli_attempts(prompt, cwd, attempts, _parse_claude_event):
        yield event


def _build_claude_attempts(exe: str, model: str | None) -> list[dict[str, Any]]:
    base_args = [exe, "-p", "--output-format", "stream-json", "--verbose"]
    plain_args = [exe, "-p"]
    if _flag_supported(exe, "--include-partial-messages"):
        base_args.append("--include-partial-messages")
    if model:
        base_args.extend(["--model", model])
        plain_args.extend(["--model", model])
    args_with_perm = [*base_args]
    if _flag_supported(exe, "--permission-mode"):
        args_with_perm.extend(["--permission-mode", "bypassPermissions"])

    return [
        {"args": args_with_perm, "stdin": True, "prompt_arg": False, "blocking_capture": True},
        {"args": base_args, "stdin": True, "prompt_arg": False, "blocking_capture": True},
        {"args": plain_args, "stdin": True, "prompt_arg": False, "blocking_capture": True},
        {"args": base_args, "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": plain_args, "stdin": False, "prompt_arg": True, "blocking_capture": True},
    ]


def _parse_claude_event(ev: dict[str, Any], state: dict[str, Any]) -> list[dict[str, Any]]:
    if "_error" in ev:
        return [{"type": "error", "message": ev["_error"]}]
    if "_raw_text" in ev:
        text = str(ev["_raw_text"]).strip()
        if not text:
            return []
        if _looks_like_limit_error(text):
            return [{"type": "error", "message": text}]
        return [{"type": "text", "content": text}]

    ev_type = ev.get("type")
    out: list[dict[str, Any]] = []

    if ev_type == "system" and ev.get("subtype") == "init":
        out.append({"type": "status", "label": "initializing", "model": ev.get("model") or ""})
    elif ev_type == "system" and ev.get("subtype") == "status":
        out.append({"type": "status", "label": ev.get("status") or "working"})
    elif ev_type == "stream_event":
        out.extend(_parse_claude_stream_event(ev.get("event") or {}, state))
    elif ev_type == "assistant":
        message = ev.get("message") if isinstance(ev.get("message"), dict) else {}
        msg_id = message.get("id")
        if msg_id:
            state["current_message_id"] = msg_id
        already_streamed = msg_id in state["text_streamed"] if msg_id else False
        for block in message.get("content") or []:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type")
            if block_type == "tool_use":
                out.append({
                    "type": "tool_start",
                    "tool": block.get("name") or "tool",
                    "tool_use_id": block.get("id") or "",
                    "input": _normalize_tool_input(block.get("input")),
                    "approved": True,
                })
            elif not already_streamed and block_type == "text" and block.get("text"):
                text = str(block["text"])
                if _looks_like_limit_error(text):
                    out.append({"type": "error", "message": text})
                else:
                    out.append({"type": "text", "content": text})
            elif not already_streamed and block_type == "thinking" and block.get("thinking"):
                out.append({"type": "thinking_delta", "delta": str(block["thinking"])})
    elif ev_type == "user":
        message = ev.get("message") if isinstance(ev.get("message"), dict) else {}
        for block in message.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                out.append({
                    "type": "tool_result",
                    "tool": "tool",
                    "tool_use_id": block.get("tool_use_id") or "",
                    "output": _safe_json_text(block.get("content")),
                    "success": not bool(block.get("is_error")),
                })
    elif ev_type == "result":
        out.append({
            "type": "usage",
            "usage": _format_usage(ev.get("usage")),
            "cost_usd": ev.get("total_cost_usd"),
            "duration_ms": ev.get("duration_ms"),
        })

    return out


def _parse_claude_stream_event(event: dict[str, Any], state: dict[str, Any]) -> list[dict[str, Any]]:
    event_type = event.get("type")
    out: list[dict[str, Any]] = []

    if event_type == "message_start":
        msg = event.get("message") if isinstance(event.get("message"), dict) else {}
        state["current_message_id"] = msg.get("id")
        out.append({"type": "status", "label": "streaming"})
    elif event_type == "content_block_start":
        block = event.get("content_block") if isinstance(event.get("content_block"), dict) else {}
        if block.get("type") == "thinking":
            out.append({"type": "thinking_start"})
    elif event_type == "content_block_delta":
        delta = event.get("delta") if isinstance(event.get("delta"), dict) else {}
        if delta.get("type") == "text_delta" and delta.get("text"):
            msg_id = state.get("current_message_id")
            if msg_id:
                state["text_streamed"].add(msg_id)
            text = str(delta["text"])
            if _looks_like_limit_error(text):
                out.append({"type": "error", "message": text})
            else:
                out.append({"type": "text", "content": text})
        elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
            msg_id = state.get("current_message_id")
            if msg_id:
                state["text_streamed"].add(msg_id)
            out.append({"type": "thinking_delta", "delta": str(delta["thinking"])})

    return out


async def run_codex_cli(
    prompt: str,
    model: str | None = None,
    cwd: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    exe = cli_path("codex-cli") or "codex"
    normalized_model = normalize_cli_model("codex-cli", model)
    attempts = _codex_attempts(exe, normalized_model, cwd)
    last_events: list[dict[str, Any]] = []

    for index, attempt in enumerate(attempts):
        events = await _collect_codex_attempt(
            attempt["args"],
            prompt,
            cwd,
            attempt.get("output_path"),
            shell_pipe=bool(attempt.get("shell_pipe")),
            console_capture=bool(attempt.get("console_capture")),
        )
        last_events = events
        if not _codex_attempt_needs_retry(events):
            for event in events:
                yield event
            return

        if index == len(attempts) - 1:
            break

    fallback_events = _codex_final_events(last_events, exe)
    for event in fallback_events or [{
        "type": "error",
        "message": f"Codex CLI produced no response. Kodo used: {exe}",
    }]:
        yield event


def _codex_final_events(events: list[dict[str, Any]], exe: str) -> list[dict[str, Any]]:
    if not events:
        return events
    has_text = any(event.get("type") == "text" and str(event.get("content") or "").strip() for event in events)
    has_nonblank_error = _codex_has_nonblank_error(events)
    if has_text or has_nonblank_error:
        return events
    if any(event.get("type") == "error" for event in events):
        return [{
            "type": "error",
            "message": (
                "Codex CLI returned an empty error. Kodo used the VS Code Codex binary "
                f"at {exe}, but Codex did not provide a message."
            ),
        }]
    return events


def _codex_attempts(exe: str, model: str, cwd: str | None) -> list[dict[str, Any]]:
    disable_plugins = os.getenv("KODO_CODEX_DISABLE_PLUGINS", "").strip() == "1"
    output_path = _codex_output_path()
    attempts = [{
        "args": _codex_args(exe, model, cwd, output_path=output_path, disable_plugins=disable_plugins),
        "output_path": output_path,
    }]

    # The ChatGPT VS Code extension bundles the same Codex binary authenticated
    # by the user's ChatGPT account. Prefer it as the recovery path when Kodo
    # was pointed at an older PATH shim or stale model setting.
    for candidate in _extension_binary_candidates("codex-cli"):
        if candidate != exe:
            output_path = _codex_output_path()
            attempts.append({
                "args": _codex_args(candidate, CLI_DEFAULT_MODEL, cwd, output_path=output_path, disable_plugins=disable_plugins),
                "output_path": output_path,
            })
            break

    if model != CLI_DEFAULT_MODEL:
        output_path = _codex_output_path()
        default_args = _codex_args(attempts[-1]["args"][0], CLI_DEFAULT_MODEL, cwd, output_path=output_path, disable_plugins=disable_plugins)
        if default_args != attempts[-1]["args"]:
            attempts.append({"args": default_args, "output_path": output_path})

    if not disable_plugins:
        recovery_exe = attempts[-1]["args"][0]
        output_path = _codex_output_path()
        recovery_args = _codex_args(recovery_exe, CLI_DEFAULT_MODEL, cwd, output_path=output_path, disable_plugins=True)
        if recovery_args != attempts[-1]["args"]:
            attempts.append({"args": recovery_args, "output_path": output_path})

    if sys.platform == "win32":
        shell_args = _codex_args(exe, CLI_DEFAULT_MODEL, cwd, output_path=_codex_output_path(), disable_plugins=disable_plugins)
        attempts.append({
            "args": shell_args,
            "output_path": _codex_arg_value(shell_args, "--output-last-message"),
            "shell_pipe": True,
        })
        if not disable_plugins:
            shell_args = _codex_args(exe, CLI_DEFAULT_MODEL, cwd, output_path=_codex_output_path(), disable_plugins=True)
            attempts.append({
                "args": shell_args,
                "output_path": _codex_arg_value(shell_args, "--output-last-message"),
                "shell_pipe": True,
            })
        console_args = _codex_args(exe, CLI_DEFAULT_MODEL, cwd, output_path=_codex_output_path(), disable_plugins=disable_plugins)
        attempts.append({
            "args": console_args,
            "output_path": _codex_arg_value(console_args, "--output-last-message"),
            "console_capture": True,
        })

    return attempts


def _codex_arg_value(args: list[str], name: str) -> str | None:
    try:
        index = args.index(name)
        return args[index + 1]
    except Exception:
        return None


def _codex_output_path() -> str:
    fd, path = tempfile.mkstemp(prefix="kodo-codex-", suffix=".txt")
    os.close(fd)
    return path


def _codex_args(
    exe: str,
    model: str,
    cwd: str | None,
    *,
    output_path: str,
    disable_plugins: bool,
) -> list[str]:
    args = [
        exe,
        "exec",
        "--json",
        "--output-last-message",
        output_path,
        "--skip-git-repo-check",
        "--full-auto",
        "-c",
        "sandbox_workspace_write.network_access=true",
    ]
    if disable_plugins:
        args.extend(["--disable", "plugins"])
    if cwd:
        args.extend(["-C", cwd])
    if model and model != CLI_DEFAULT_MODEL:
        args.extend(["--model", model])
    return args


async def _collect_codex_attempt(
    args: list[str],
    prompt: str,
    cwd: str | None,
    output_path: str | None,
    *,
    shell_pipe: bool = False,
    console_capture: bool = False,
) -> list[dict[str, Any]]:
    seen_tools: set[str] = set()
    events: list[dict[str, Any]] = []
    saw_structured_error = False

    if console_capture:
        stream = _spawn_console_capture_and_stream_lines(args, prompt, cwd, env=_codex_env(), yield_stderr_on_success=True)
    elif shell_pipe:
        stream = _spawn_shell_pipe_and_stream_lines(args, prompt, cwd, env=_codex_env(), yield_stderr_on_success=True)
    else:
        stream = _spawn_and_stream_lines(args, prompt, cwd, env=_codex_env(), yield_stderr_on_success=True)
    async for ev in stream:
        if "_stderr" in ev:
            message = _codex_stderr_error(ev["_stderr"])
            if message and not any(event.get("type") == "text" for event in events):
                events = [
                    event for event in events
                    if not (event.get("type") == "error" and not str(event.get("message") or "").strip())
                ]
                events.append({"type": "error", "message": message})
                saw_structured_error = True
            continue
        if "_error" in ev and saw_structured_error and _codex_has_nonblank_error(events):
            continue
        for parsed in _parse_codex_event(ev, seen_tools):
            if parsed.get("type") == "error":
                saw_structured_error = True
            if _codex_should_append_event(events, parsed):
                events.append(parsed)

    output_text = _read_codex_output_file(output_path)
    if output_text and not any(event.get("type") == "text" for event in events):
        events = [
            event for event in events
            if not (event.get("type") == "error" and not str(event.get("message") or "").strip())
        ]
        events.append({"type": "text", "content": output_text})

    return events


def _codex_has_nonblank_error(events: list[dict[str, Any]]) -> bool:
    return any(
        event.get("type") == "error" and str(event.get("message") or "").strip()
        for event in events
    )


def _codex_should_append_event(events: list[dict[str, Any]], event: dict[str, Any]) -> bool:
    if event.get("type") != "error":
        return True
    message = str(event.get("message") or "").strip()
    if not message:
        return True
    return not any(
        existing.get("type") == "error" and str(existing.get("message") or "").strip() == message
        for existing in events
    )


def _codex_env() -> dict[str, str | None]:
    env: dict[str, str | None] = {
        key: None
        for key in os.environ
        if key.startswith("CODEX_") and key != "CODEX_HOME"
    }
    env.update({
        "CODEX_HOME": os.getenv("CODEX_HOME") or str(Path.home() / ".codex"),
        "CODEX_API_KEY": None,
        "OPENAI_API_KEY": None,
    })
    for key in ("USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA"):
        value = os.getenv(key)
        if value:
            env[key] = value
    return env


def _codex_stderr_error(stderr_text: str) -> str:
    fallback = ""
    for line in stderr_text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except Exception:
            lower = line.lower()
            if (
                "usage limit" in lower
                or "hit your limit" in lower
                or "requires a newer version of codex" in lower
                or "unsupported model" in lower
            ):
                fallback = line
            continue
        if not isinstance(payload, dict):
            continue
        if payload.get("type") == "error":
            message = _clean_codex_error(payload.get("message") or payload.get("error"))
            if message:
                return message
        if payload.get("type") == "turn.failed":
            error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
            message = _clean_codex_error(error.get("message") or payload.get("message"))
            if message:
                return message
    return fallback


def _read_codex_output_file(output_path: str | None) -> str:
    if not output_path:
        return ""
    path = Path(output_path)
    try:
        if not path.is_file():
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    finally:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass


def _codex_attempt_needs_retry(events: list[dict[str, Any]]) -> bool:
    if not events:
        return True

    has_text = any(event.get("type") == "text" and str(event.get("content") or "").strip() for event in events)
    has_usage = any(event.get("type") == "usage" for event in events)
    errors = [
        str(event.get("message") or "")
        for event in events
        if event.get("type") == "error"
    ]
    if not errors:
        return not (has_text or has_usage)

    combined = "\n".join(errors).lower()
    retry_tokens = [
        "requires a newer version of codex",
        "unsupported model",
        "model_not_found",
        "not supported with this version",
        "unknown model",
        "failed to sync plugin",
        "sync plugin",
        "plugin",
        "forbidden",
        "403",
    ]
    return any(token in combined for token in retry_tokens) or not has_text


def _parse_codex_event(ev: dict[str, Any], seen_tools: set[str]) -> list[dict[str, Any]]:
    if "_error" in ev:
        return [{"type": "error", "message": ev["_error"]}]
    if "_raw_text" in ev:
        text = str(ev["_raw_text"]).strip()
        return [{"type": "text", "content": text + "\n"}] if text else []

    ev_type = ev.get("type")
    out: list[dict[str, Any]] = []
    item = ev.get("item") if isinstance(ev.get("item"), dict) else {}

    if ev_type == "error":
        out.append({"type": "error", "message": _clean_codex_error(ev.get("message") or ev.get("error"))})
    elif ev_type == "thread.started":
        out.append({"type": "status", "label": "initializing"})
    elif ev_type == "turn.started":
        out.append({"type": "status", "label": "running"})
    elif ev_type == "turn.failed":
        error = ev.get("error") if isinstance(ev.get("error"), dict) else {}
        out.append({"type": "error", "message": _clean_codex_error(error.get("message") or ev.get("message"))})
    elif ev_type == "item.started" and item.get("type") == "command_execution":
        tool_id = str(item.get("id") or "")
        if tool_id and tool_id not in seen_tools:
            seen_tools.add(tool_id)
            out.append({
                "type": "tool_start",
                "tool": "Bash",
                "tool_use_id": tool_id,
                "input": {"command": str(item.get("command") or "")},
                "approved": True,
            })
    elif ev_type == "item.completed" and item.get("type") == "command_execution":
        tool_id = str(item.get("id") or "")
        if tool_id and tool_id not in seen_tools:
            seen_tools.add(tool_id)
            out.append({
                "type": "tool_start",
                "tool": "Bash",
                "tool_use_id": tool_id,
                "input": {"command": str(item.get("command") or "")},
                "approved": True,
            })
        out.append({
            "type": "tool_result",
            "tool": "Bash",
            "tool_use_id": tool_id,
            "output": _safe_json_text(item.get("aggregated_output") or ""),
            "success": item.get("exit_code") == 0 or item.get("status") == "completed",
        })
    elif ev_type == "item.completed" and item.get("type") == "agent_message":
        text = item.get("text")
        if isinstance(text, str) and text:
            out.append({"type": "text", "content": text})
    elif ev_type == "turn.completed":
        out.append({"type": "usage", "usage": _format_usage(ev.get("usage"))})

    return out


def _clean_codex_error(value: Any) -> str:
    text = str(value or "Codex CLI failed").strip()
    if not text:
        return "Codex CLI failed"
    try:
        parsed = json.loads(text)
    except Exception:
        return text
    if isinstance(parsed, dict):
        detail = parsed.get("detail") or parsed.get("message") or parsed.get("error")
        if detail:
            return str(detail)
    return text


async def run_gemini_cli(
    prompt: str,
    model: str | None = None,
    cwd: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    exe = cli_path("gemini-cli") or "gemini"
    normalized_model = _normalize_provider_model("gemini-cli", model)
    model_sequence: list[str | None] = []
    if normalized_model != CLI_DEFAULT_MODEL:
        model_sequence.append(normalized_model)
    model_sequence.append(None)
    for fallback in _GEMINI_MODEL_FALLBACKS:
        if fallback not in model_sequence:
            model_sequence.append(fallback)

    attempts: list[dict[str, Any]] = []
    for model_name in model_sequence:
        attempts.extend(_build_gemini_attempts(exe, model_name))

    async for event in _run_cli_attempts(prompt, cwd, attempts, lambda ev, _state: _parse_gemini_event(ev)):
        yield event


def _build_gemini_attempts(exe: str, model: str | None) -> list[dict[str, Any]]:
    args_stream = [exe, "--output-format", "stream-json", "--skip-trust", "--yolo"]
    args_json = [exe, "--output-format", "json", "--skip-trust", "--yolo"]
    args_plain = [exe]

    if model:
        args_stream.extend(["--model", model])
        args_json.extend(["--model", model])
        args_plain.extend(["--model", model])

    return [
        {"args": [*args_stream, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": [*args_json, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": [*args_plain, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": args_stream, "stdin": True, "prompt_arg": False, "blocking_capture": True},
        {"args": args_json, "stdin": True, "prompt_arg": False, "blocking_capture": True},
    ]


def _parse_gemini_event(ev: dict[str, Any]) -> list[dict[str, Any]]:
    if "_error" in ev:
        return [{"type": "error", "message": _clean_gemini_error(ev["_error"])}]
    if "_raw_text" in ev:
        text = str(ev["_raw_text"]).strip()
        return [{"type": "text", "content": text + "\n"}] if text else []

    ev_type = ev.get("type")
    if ev_type == "init":
        return [{"type": "status", "label": "initializing", "model": ev.get("model") or ""}]
    if ev_type == "message" and ev.get("role") in {"assistant", "model", None, ""}:
        if isinstance(ev.get("content"), str) and ev["content"]:
            return [{"type": "text", "content": ev["content"]}]
        parts = ev.get("parts") if isinstance(ev.get("parts"), list) else []
        out: list[dict[str, Any]] = []
        for part in parts:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                out.append({"type": "text", "content": part["text"]})
        return out
    if ev_type == "result":
        stats = ev.get("stats") if isinstance(ev.get("stats"), dict) else ev.get("usage")
        return [{"type": "usage", "usage": _format_usage(stats), "duration_ms": ev.get("duration_ms")}]
    return []


def _clean_gemini_error(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "Gemini CLI failed without an error message."

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    filtered = [
        line for line in lines
        if not any(line.startswith(prefix) for prefix in _GEMINI_NOISE_PREFIXES)
    ]
    if not filtered:
        filtered = lines

    combined = "\n".join(filtered)
    lowered = combined.lower()
    if "modelnotfounderror" in lowered or "requested entity was not found" in lowered:
        return (
            "Gemini CLI model was not found for this account. "
            "Set a supported model (for example gemini-2.5-flash) in Gemini CLI config or in Kodo."
        )

    if "error when talking to gemini api" in lowered:
        for line in filtered:
            if "error when talking to gemini api" in line.lower():
                return line

    return combined[:1200]


def _looks_like_limit_error(text: str) -> bool:
    lowered = text.lower()
    return any(
        token in lowered
        for token in (
            "credit balance is too low",
            "usage limit",
            "hit your limit",
            "rate limit",
            "quota",
            "insufficient",
        )
    )


async def run_copilot_cli(
    prompt: str,
    model: str | None = None,
    cwd: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    exe = cli_path("copilot-cli") or "copilot"
    normalized_model = _normalize_provider_model("copilot-cli", model)
    base = os.path.basename(exe).lower()
    if base.startswith("gh"):
        base_args = [exe, "copilot"]
        chat_args = [exe, "copilot", "chat"]
    else:
        base_args = [exe]
        chat_args: list[str] = []

    model_sequence: list[str | None] = []
    if normalized_model != CLI_DEFAULT_MODEL:
        model_sequence.append(normalized_model)
    model_sequence.append(None)

    attempts: list[dict[str, Any]] = []
    for model_name in model_sequence:
        attempts.extend(_build_copilot_attempts(base_args, chat_args, model_name))

    async for event in _run_cli_attempts(prompt, cwd, attempts, _parse_copilot_event):
        yield event


def _build_copilot_attempts(
    base_args: list[str],
    chat_args: list[str],
    model: str | None,
) -> list[dict[str, Any]]:
    args_json = [*base_args, "--output-format", "json"]
    args_all_json = [*base_args, "--allow-all", "--no-ask-user", "--output-format", "json"]
    args_tools_json = [*base_args, "--allow-all-tools", "--no-ask-user", "--output-format", "json"]
    args_plain = [*base_args]

    if model:
        args_all_json.extend(["--model", model])
        args_tools_json.extend(["--model", model])
        args_json.extend(["--model", model])
        args_plain.extend(["--model", model])

    attempts: list[dict[str, Any]] = [
        {"args": [*args_all_json, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": [*args_tools_json, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": [*args_json, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": [*args_plain, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        {"args": args_tools_json, "stdin": True, "prompt_arg": False, "blocking_capture": True},
    ]
    if chat_args:
        chat_json = [*chat_args, "--allow-all-tools", "--no-ask-user", "--output-format", "json"]
        chat_plain = [*chat_args]
        if model:
            chat_json.extend(["--model", model])
            chat_plain.extend(["--model", model])
        attempts.extend([
            {"args": [*chat_json, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
            {"args": [*chat_plain, "-p"], "stdin": False, "prompt_arg": True, "blocking_capture": True},
        ])
    return attempts


def _parse_copilot_event(ev: dict[str, Any], state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    state = state if isinstance(state, dict) else {}
    if "_error" in ev:
        return [{"type": "error", "message": ev["_error"]}]
    if "_raw_text" in ev:
        text = str(ev["_raw_text"]).strip()
        return [{"type": "text", "content": text + "\n"}] if text else []

    ev_type = ev.get("type")
    data = ev.get("data") if isinstance(ev.get("data"), dict) else {}
    if ev_type == "session.tools_updated":
        return [{"type": "status", "label": "initializing", "model": data.get("model") or ""}]
    if ev_type == "assistant.turn_start":
        return [{"type": "status", "label": "streaming"}]
    if ev_type == "assistant.reasoning_delta" and isinstance(data.get("deltaContent"), str):
        return [{"type": "thinking_delta", "delta": data["deltaContent"]}]
    if ev_type == "assistant.message_delta" and isinstance(data.get("deltaContent"), str):
        state["copilot_text_streamed"] = True
        return [{"type": "text", "content": data["deltaContent"]}]
    if ev_type == "assistant.message" and isinstance(data.get("content"), str):
        if state.get("copilot_text_streamed"):
            return []
        return [{"type": "text", "content": data["content"]}]
    if ev_type == "tool.execution_start":
        return [{
            "type": "tool_start",
            "tool": data.get("toolName") or "tool",
            "tool_use_id": data.get("toolCallId") or "",
            "input": _normalize_tool_input(data.get("arguments")),
            "approved": True,
        }]
    if ev_type == "tool.execution_complete":
        return [{
            "type": "tool_result",
            "tool": data.get("toolName") or "tool",
            "tool_use_id": data.get("toolCallId") or "",
            "output": _safe_json_text(data.get("result")),
            "success": data.get("success") is not False,
        }]
    if ev_type == "result":
        return [{"type": "usage", "usage": _format_usage(ev.get("usage"))}]
    return []


async def run_cli_provider(
    provider_id: str,
    prompt: str,
    model: str | None = None,
    cwd: str | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    if provider_id == "claude-cli":
        async for ev in run_claude_cli(prompt, model=model, cwd=cwd):
            yield ev
    elif provider_id == "codex-cli":
        async for ev in run_codex_cli(prompt, model=model, cwd=cwd):
            yield ev
    elif provider_id == "gemini-cli":
        async for ev in run_gemini_cli(prompt, model=model, cwd=cwd):
            yield ev
    elif provider_id == "copilot-cli":
        async for ev in run_copilot_cli(prompt, model=model, cwd=cwd):
            yield ev
    else:
        yield {"type": "error", "message": f"Unknown CLI provider: {provider_id}"}


def _flag_supported(exe: str, flag: str) -> bool:
    try:
        result = subprocess.run(
            [exe, "--help"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return flag in output
    except Exception:
        return False


def _normalize_provider_model(provider_id: str, model: str | None) -> str:
    return normalize_cli_model(provider_id, model)


def _attempt_key(attempt: dict[str, Any]) -> tuple[tuple[str, ...], bool, bool]:
    return (
        tuple(str(part) for part in attempt.get("args") or []),
        bool(attempt.get("stdin", True)),
        bool(attempt.get("prompt_arg", False)),
    )


def _skip_prompt_arg_for_windows(args: list[str], prompt: str, prompt_arg: bool) -> bool:
    if not prompt_arg or sys.platform != "win32":
        return False
    approx = subprocess.list2cmdline([*args, prompt])
    # Keep a margin below Windows cmdline limits to avoid "The command line is too long."
    return len(approx) >= 7000


def _is_generic_exit_error(message: str) -> bool:
    lowered = message.lower()
    return " exited with code " in lowered or "exited with status" in lowered


def _drop_redundant_exit_errors(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    has_text = any(
        event.get("type") == "text"
        and str(event.get("content") or "").strip()
        for event in events
    )
    has_specific_error = any(
        event.get("type") == "error"
        and str(event.get("message") or "").strip()
        and not _is_generic_exit_error(str(event.get("message") or ""))
        for event in events
    )
    if not has_text and not has_specific_error:
        return events

    filtered: list[dict[str, Any]] = []
    changed = False
    for event in events:
        if event.get("type") == "error":
            message = str(event.get("message") or "").strip()
            if message and _is_generic_exit_error(message):
                changed = True
                continue
        filtered.append(event)
    return filtered if changed else events


def _has_nonempty_text(events: list[dict[str, Any]]) -> bool:
    return any(
        event.get("type") == "text"
        and str(event.get("content") or "").strip()
        for event in events
    )


def _has_nonempty_error(events: list[dict[str, Any]]) -> bool:
    return any(
        event.get("type") == "error"
        and str(event.get("message") or "").strip()
        for event in events
    )


def _has_nonretryable_cli_error(events: list[dict[str, Any]]) -> bool:
    for event in events:
        if event.get("type") != "error":
            continue
        message = str(event.get("message") or "").strip().lower()
        if not message:
            continue
        if any(
            token in message
            for token in (
                "usage limit",
                "hit your limit",
                "rate limit",
                "quota",
                "credit balance",
                "insufficient",
                "not logged in",
                "login required",
                "authentication",
                "unauthorized",
                "forbidden",
                "permission denied",
            )
        ):
            return True
    return False


def _best_stderr_message(stderr_text: str) -> str:
    text = str(stderr_text or "").strip()
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return text[:1200]
    priority_tokens = (
        "error",
        "failed",
        "exception",
        "not found",
        "denied",
        "unauthorized",
        "forbidden",
        "quota",
        "limit",
        "invalid",
    )
    for line in lines:
        lowered = line.lower()
        if any(token in lowered for token in priority_tokens):
            return line[:1200]
    return "\n".join(lines[:5])[:1200]


def _sanitize_error_events(
    events: list[dict[str, Any]],
    *,
    command: str,
    stderr_text: str = "",
) -> list[dict[str, Any]]:
    fallback = _best_stderr_message(stderr_text) or (
        f"CLI command failed without an error message. Command: {command}"
    )
    sanitized: list[dict[str, Any]] = []
    for event in events:
        if event.get("type") != "error":
            sanitized.append(event)
            continue
        message = str(event.get("message") or "").strip()
        if message:
            sanitized.append(event)
            continue
        cloned = dict(event)
        cloned["message"] = fallback
        sanitized.append(cloned)
    return sanitized


def _cli_attempt_needs_retry(events: list[dict[str, Any]]) -> bool:
    if not events:
        return True

    has_text = _has_nonempty_text(events)
    if has_text:
        return False

    has_error = _has_nonempty_error(events)
    if has_error:
        if _has_nonretryable_cli_error(events):
            return False
        return True

    has_usage_with_output = any(
        event.get("type") == "usage"
        and int(
            (
                event.get("usage", {}).get("output_tokens", 0)
                if isinstance(event.get("usage"), dict)
                else 0
            ) or 0
        ) > 0
        for event in events
    )
    return not has_usage_with_output


async def _run_cli_attempts(
    prompt: str,
    cwd: str | None,
    attempts: list[dict[str, Any]],
    parse_event,
) -> AsyncGenerator[dict[str, Any], None]:
    seen_attempts: set[tuple[tuple[str, ...], bool, bool]] = set()
    last_events: list[dict[str, Any]] = []

    for raw_attempt in attempts:
        key = _attempt_key(raw_attempt)
        if key in seen_attempts:
            continue
        seen_attempts.add(key)

        args = list(raw_attempt.get("args") or [])
        if not args:
            continue
        if _skip_prompt_arg_for_windows(args, prompt, bool(raw_attempt.get("prompt_arg", False))):
            continue
        if raw_attempt.get("prompt_arg"):
            args = [*args, prompt]

        state = {"current_message_id": None, "text_streamed": set()}
        collected: list[dict[str, Any]] = []
        stderr_chunks: list[str] = []
        spawn = _spawn_blocking_capture_and_stream_lines if raw_attempt.get("blocking_capture") else _spawn_and_stream_lines
        async for ev in spawn(
            args,
            prompt,
            cwd,
            write_prompt_to_stdin=bool(raw_attempt.get("stdin", True)),
            yield_stderr_on_success=True,
        ):
            if "_stderr" in ev:
                stderr_chunks.append(str(ev.get("_stderr") or ""))
                continue
            parsed_events = parse_event(ev, state)
            for parsed in parsed_events:
                collected.append(parsed)

        stderr_text = "\n".join(chunk for chunk in stderr_chunks if chunk).strip()
        if not _has_nonempty_text(collected) and not _has_nonempty_error(collected):
            stderr_message = _best_stderr_message(stderr_text)
            if stderr_message:
                collected.append({"type": "error", "message": stderr_message})

        collected = _drop_redundant_exit_errors(collected)
        collected = _sanitize_error_events(
            collected,
            command=subprocess.list2cmdline(args),
            stderr_text=stderr_text,
        )
        last_events = collected
        if not _cli_attempt_needs_retry(collected):
            for event in collected:
                yield event
            return

    fallback = _sanitize_error_events(last_events, command="(no command)") if last_events else [{
        "type": "error",
        "message": "CLI produced no usable response. Check login/auth and CLI flags.",
    }]
    for event in fallback:
        yield event
