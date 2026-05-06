from __future__ import annotations

from pathlib import Path

import pytest

from agent import cli_runner


def test_codex_cli_prefers_vscode_extension_binary(monkeypatch, tmp_path: Path):
    extension_root = tmp_path / "extensions"
    bundled = extension_root / "openai.chatgpt-1.0.0-win32-x64" / "bin" / "windows-x86_64" / "codex.exe"
    bundled.parent.mkdir(parents=True)
    bundled.write_text("", encoding="utf-8")

    monkeypatch.setenv("KODO_VSCODE_EXTENSIONS_DIR", str(extension_root))
    monkeypatch.delenv("KODO_CODEX_CLI_PATH", raising=False)
    monkeypatch.setattr(cli_runner.sys, "platform", "win32")
    monkeypatch.setattr(
        cli_runner.shutil,
        "which",
        lambda exe: r"C:\Users\haris\AppData\Roaming\npm\codex.CMD" if exe == "codex" else None,
    )

    assert cli_runner.cli_path("codex-cli") == str(bundled)


def test_codex_cli_prefers_modern_path_binary_over_vscode_extension(monkeypatch, tmp_path: Path):
    extension_root = tmp_path / "extensions"
    bundled = extension_root / "openai.chatgpt-1.0.0-win32-x64" / "bin" / "windows-x86_64" / "codex.exe"
    bundled.parent.mkdir(parents=True)
    bundled.write_text("", encoding="utf-8")

    path_codex = r"C:\Users\haris\AppData\Local\Volta\bin\codex.CMD"
    monkeypatch.setenv("KODO_VSCODE_EXTENSIONS_DIR", str(extension_root))
    monkeypatch.delenv("KODO_CODEX_CLI_PATH", raising=False)
    monkeypatch.setattr(cli_runner.sys, "platform", "win32")
    monkeypatch.setattr(cli_runner.shutil, "which", lambda exe: path_codex if exe == "codex" else None)
    monkeypatch.setattr(cli_runner, "_codex_cli_is_modern", lambda exe: True)

    assert cli_runner.cli_path("codex-cli") == path_codex


def test_parse_codex_structured_error_uses_detail_message():
    parsed = cli_runner._parse_codex_event(
        {
            "type": "error",
            "message": '{"detail":"The model requires a newer version of Codex."}',
        },
        set(),
    )

    assert parsed == [
        {
            "type": "error",
            "message": "The model requires a newer version of Codex.",
        }
    ]


def test_normalize_cli_model_drops_stale_api_models():
    assert cli_runner.normalize_cli_model("codex-cli", "gpt-4o") == "default"
    assert cli_runner.normalize_cli_model("codex-cli", "meta/llama-3.1-8b-instruct") == "default"
    assert cli_runner.normalize_cli_model("codex-cli", "gpt-5.5") == "gpt-5.5"


def test_normalize_provider_model_drops_cross_provider_model_ids():
    assert cli_runner._normalize_provider_model("claude-cli", "gpt-5.5") == "default"
    assert cli_runner._normalize_provider_model("gemini-cli", "claude-sonnet-4-6") == "default"
    assert cli_runner._normalize_provider_model("claude-cli", "claude-opus-4-1") == "claude-opus-4-1"


def test_normalize_cli_model_uses_available_cli_catalog():
    available = ["default", "claude-sonnet-4-6", "claude-opus-4-1"]

    assert cli_runner.normalize_cli_model(
        "claude-cli",
        "claude-opus-4-1",
        available_models=available,
    ) == "claude-opus-4-1"
    assert cli_runner.normalize_cli_model(
        "claude-cli",
        "gpt-5.5",
        available_models=available,
    ) == "default"


def test_list_cli_models_includes_discovered_and_known_defaults(monkeypatch):
    monkeypatch.setattr(
        cli_runner,
        "_discover_cli_models",
        lambda provider_id: ["gpt-5.4-mini", "gpt-5.3-codex"] if provider_id == "copilot-cli" else [],
    )

    models = cli_runner.list_cli_models("copilot-cli")

    assert models[0] == "default"
    assert "gpt-5.3-codex" in models
    assert "gpt-5.4-mini" in models


def test_copilot_cli_prefers_gh_when_copilot_extension_available(monkeypatch):
    monkeypatch.delenv("KODO_COPILOT_CLI_PATH", raising=False)
    monkeypatch.setattr(
        cli_runner.shutil,
        "which",
        lambda exe: rf"C:\tools\{exe}.exe" if exe in {"gh", "copilot"} else None,
    )
    monkeypatch.setattr(cli_runner, "_gh_copilot_available", lambda exe: True)

    assert cli_runner.cli_path("copilot-cli") == r"C:\tools\gh.exe"


def test_requires_shell_invocation_for_windows_cmd(monkeypatch):
    monkeypatch.setattr(cli_runner.sys, "platform", "win32")
    assert cli_runner._requires_shell_invocation(r"C:\Users\me\AppData\Roaming\npm\gemini.cmd")
    assert not cli_runner._requires_shell_invocation(r"C:\tools\codex.exe")


def test_build_gemini_attempts_starts_with_headless_prompt_mode():
    attempts = cli_runner._build_gemini_attempts("gemini", "gemini-2.5-flash")

    assert attempts[0] == {
        "args": [
            "gemini",
            "--output-format",
            "stream-json",
            "--skip-trust",
            "--yolo",
            "--model",
            "gemini-2.5-flash",
            "-p",
        ],
        "stdin": False,
        "prompt_arg": True,
        "blocking_capture": True,
    }


def test_build_copilot_attempts_starts_with_noninteractive_prompt_mode():
    attempts = cli_runner._build_copilot_attempts(["copilot"], [], "gpt-5.3-codex")

    assert attempts[0] == {
        "args": [
            "copilot",
            "--allow-all",
            "--no-ask-user",
            "--output-format",
            "json",
            "--model",
            "gpt-5.3-codex",
            "-p",
        ],
        "stdin": False,
        "prompt_arg": True,
        "blocking_capture": True,
    }


def test_parse_copilot_event_drops_final_duplicate_after_streamed_delta():
    state: dict[str, object] = {}

    first = cli_runner._parse_copilot_event(
        {"type": "assistant.message_delta", "data": {"deltaContent": "ok"}},
        state,
    )
    second = cli_runner._parse_copilot_event(
        {"type": "assistant.message", "data": {"content": "ok"}},
        state,
    )

    assert first == [{"type": "text", "content": "ok"}]
    assert second == []


def test_skip_prompt_arg_for_windows_when_command_too_long(monkeypatch):
    monkeypatch.setattr(cli_runner.sys, "platform", "win32")
    args = [r"C:\tools\copilot.cmd", "--output-format", "json"]
    prompt = "x" * 9000
    assert cli_runner._skip_prompt_arg_for_windows(args, prompt, True) is True
    assert cli_runner._skip_prompt_arg_for_windows(args, "short", True) is False
    assert cli_runner._skip_prompt_arg_for_windows(args, prompt, False) is False


def test_cli_attempt_needs_retry_with_error_and_usage_but_no_text():
    events = [
        {"type": "usage", "usage": {"input_tokens": 1, "output_tokens": 0}},
        {"type": "error", "message": "ModelNotFoundError"},
    ]
    assert cli_runner._cli_attempt_needs_retry(events) is True


def test_drop_redundant_exit_error_when_text_exists():
    events = [
        {"type": "text", "content": "Credit balance is too low"},
        {"type": "error", "message": r"C:\tool\claude.exe exited with code 1"},
    ]
    cleaned = cli_runner._drop_redundant_exit_errors(events)
    assert cleaned == [{"type": "text", "content": "Credit balance is too low"}]


def test_parse_claude_event_maps_credit_limit_text_to_error():
    events = cli_runner._parse_claude_event(
        {
            "type": "assistant",
            "message": {
                "id": "m1",
                "content": [{"type": "text", "text": "Credit balance is too low"}],
            },
        },
        {"current_message_id": None, "text_streamed": set()},
    )
    assert events == [{"type": "error", "message": "Credit balance is too low"}]


def test_sanitize_error_events_replaces_blank_message():
    events = [{"type": "error", "message": ""}]
    sanitized = cli_runner._sanitize_error_events(
        events,
        command="copilot --output-format json",
        stderr_text="",
    )
    assert sanitized[0]["type"] == "error"
    assert "failed without an error message" in str(sanitized[0]["message"]).lower()


@pytest.mark.asyncio
async def test_run_codex_cli_retries_with_default_model(monkeypatch):
    calls: list[list[str]] = []

    async def fake_spawn(args: list[str], prompt: str, cwd: str | None, **kwargs):
        calls.append(args)
        if len(calls) == 1:
            yield {"type": "error", "message": "unsupported model"}
            return
        yield {"type": "item.completed", "item": {"type": "agent_message", "text": "ok"}}
        yield {"type": "turn.completed", "usage": {"input_tokens": 1, "output_tokens": 1}}

    monkeypatch.setattr(cli_runner, "cli_path", lambda provider_id: "codex")
    monkeypatch.setattr(cli_runner, "_extension_binary_candidates", lambda provider_id: [])
    monkeypatch.setattr(cli_runner, "_spawn_and_stream_lines", fake_spawn)

    events = [
        event
        async for event in cli_runner.run_codex_cli("hi", model="gpt-5.5", cwd=None)
    ]

    assert calls[0][-2:] == ["--model", "gpt-5.5"]
    assert "--model" not in calls[1]
    assert {"type": "text", "content": "ok"} in events


@pytest.mark.asyncio
async def test_run_gemini_cli_retries_without_stream_json(monkeypatch):
    calls: list[list[str]] = []

    async def fake_spawn(args: list[str], prompt: str, cwd: str | None, **kwargs):
        calls.append(args)
        if "--output-format" in args and "stream-json" in args:
            yield {"_error": "unknown option --output-format stream-json"}
            return
        yield {"_raw_text": "ok"}

    monkeypatch.setattr(cli_runner, "cli_path", lambda provider_id: "gemini")
    monkeypatch.setattr(cli_runner, "_spawn_and_stream_lines", fake_spawn)
    monkeypatch.setattr(cli_runner, "_spawn_blocking_capture_and_stream_lines", fake_spawn)

    events = [event async for event in cli_runner.run_gemini_cli("hello", model="default", cwd=None)]

    assert any("--output-format" in call and "stream-json" in call for call in calls)
    assert len(calls) >= 2
    assert {"type": "text", "content": "ok\n"} in events


@pytest.mark.asyncio
async def test_run_gemini_cli_tries_fallback_models_when_default_fails(monkeypatch):
    calls: list[list[str]] = []

    async def fake_spawn(args: list[str], prompt: str, cwd: str | None, **kwargs):
        calls.append(args)
        if "--model" in args and "gemini-2.5-flash" in args:
            yield {"_raw_text": "ok"}
            return
        yield {"_error": "ModelNotFoundError: Requested entity was not found."}
        yield {"type": "result", "usage": {"input_tokens": 0, "output_tokens": 0}}

    monkeypatch.setattr(cli_runner, "cli_path", lambda provider_id: "gemini")
    monkeypatch.setattr(cli_runner, "_spawn_and_stream_lines", fake_spawn)
    monkeypatch.setattr(cli_runner, "_spawn_blocking_capture_and_stream_lines", fake_spawn)

    events = [event async for event in cli_runner.run_gemini_cli("hello", model="default", cwd=None)]

    assert any("--model" in call and "gemini-2.5-flash" in call for call in calls)
    assert {"type": "text", "content": "ok\n"} in events


@pytest.mark.asyncio
async def test_run_copilot_cli_retries_without_model_when_modeled_attempts_fail(monkeypatch):
    calls: list[list[str]] = []

    async def fake_spawn(args: list[str], prompt: str, cwd: str | None, **kwargs):
        calls.append(args)
        if "--model" in args:
            yield {"_error": "unknown model"}
            return
        yield {"_raw_text": "ok"}

    monkeypatch.setattr(cli_runner, "cli_path", lambda provider_id: "copilot")
    monkeypatch.setattr(cli_runner, "_spawn_and_stream_lines", fake_spawn)
    monkeypatch.setattr(cli_runner, "_spawn_blocking_capture_and_stream_lines", fake_spawn)

    events = [event async for event in cli_runner.run_copilot_cli("hello", model="gpt-5.5", cwd=None)]

    assert any("--model" in call and "gpt-5.5" in call for call in calls)
    assert any("--model" not in call for call in calls)
    assert {"type": "text", "content": "ok\n"} in events


@pytest.mark.asyncio
async def test_run_cli_attempts_uses_stderr_when_no_events(monkeypatch):
    async def fake_spawn(args: list[str], prompt: str, cwd: str | None, **kwargs):
        yield {"_stderr": "authentication failed for CLI"}

    def fake_parse(ev, state):
        return []

    monkeypatch.setattr(cli_runner, "_spawn_and_stream_lines", fake_spawn)

    events = [
        event
        async for event in cli_runner._run_cli_attempts(
            "hello",
            None,
            [{"args": ["copilot"], "stdin": True, "prompt_arg": False}],
            fake_parse,
        )
    ]
    assert events
    assert events[0]["type"] == "error"
    assert "authentication failed" in str(events[0]["message"]).lower()
