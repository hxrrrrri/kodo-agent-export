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


def test_local_forced_tool_ignores_design_prompts_with_filename_instructions():
    prompt = (
        "Output complete, self-contained HTML/CSS/JS files for a single-page website. "
        "Put HTML in ```html filename.html blocks. "
        "You may also use separate ```css and ```js blocks with filenames. "
        "Never reference external files not in the response.\n\n"
        "Create an animated pricing table with 3 tiers, feature comparison, "
        "monthly/yearly toggle, and one highlighted plan."
    )

    forced = loop_mod._infer_local_forced_tool_call(
        user_message=prompt,
        provider="ollama",
        project_dir="C:/workspace",
    )

    assert forced is None
