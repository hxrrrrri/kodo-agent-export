from __future__ import annotations

import os

import agent.loop as loop_mod


def test_local_forced_tool_detects_folder_listing():
    forced = loop_mod._infer_local_forced_tool_call(
        user_message="list all folder names in this directory",
        provider="ollama",
        project_dir="C:/workspace",
    )

    assert forced is not None
    assert forced["tool"] in {"powershell", "bash"}
    assert forced["input"]["timeout"] == 30
    assert forced["input"]["cwd"] == "C:/workspace"

    command = str(forced["input"]["command"])
    if os.name == "nt":
        assert "Get-ChildItem -Directory -Name" in command
    else:
        assert "find" in command


def test_local_forced_tool_ignores_nonlocal_providers():
    forced = loop_mod._infer_local_forced_tool_call(
        user_message="list all folder names in this directory",
        provider="anthropic",
        project_dir="C:/workspace",
    )
    assert forced is None


def test_local_forced_tool_detects_pwd_request():
    forced = loop_mod._infer_local_forced_tool_call(
        user_message="what is the current directory",
        provider="atomic-chat",
        project_dir=None,
    )

    assert forced is not None
    command = str(forced["input"]["command"])
    if os.name == "nt":
        assert "Get-Location" in command
    else:
        assert command == "pwd"


def test_local_forced_tool_detects_bug_scan_intent():
    forced = loop_mod._infer_local_forced_tool_call(
        user_message="findbugs inside the directory its currently in",
        provider="ollama",
        project_dir="C:/workspace",
    )

    assert forced is not None
    assert forced["tool"] in {"powershell", "bash"}
    assert forced["input"]["timeout"] == 30
    assert forced["input"]["cwd"] == "C:/workspace"
    assert "Potential bug markers" in forced["prefix"]

    command = str(forced["input"]["command"])
    if os.name == "nt":
        assert "Select-String" in command
        assert "Get-ChildItem -Recurse -File" in command
    else:
        assert "grep -RInE" in command
