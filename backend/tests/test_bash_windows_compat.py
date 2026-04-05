from __future__ import annotations

import os

import pytest

import tools.bash as bash_mod
from tools.base import ToolResult
from tools.bash import BashTool


@pytest.mark.asyncio
async def test_windows_ls_recursive_translates_to_powershell(monkeypatch, tmp_path):
    tool = BashTool()
    captured: dict[str, str] = {}

    async def fake_ps_execute(self, command: str, timeout: int = 30, cwd: str | None = None, on_output=None, **kwargs):
        captured["command"] = command
        captured["cwd"] = str(cwd or "")
        return ToolResult(success=True, output="ok", error=None)

    monkeypatch.setattr(bash_mod.os, "name", "nt", raising=False)
    monkeypatch.setattr("tools.powershell.PowerShellTool.execute", fake_ps_execute)

    result = await tool.execute(command="ls -R", cwd=str(tmp_path), timeout=20)

    assert result.success is True
    assert captured["command"] == "Get-ChildItem -Recurse -Name"
    assert os.path.normcase(os.path.normpath(captured["cwd"])) == os.path.normcase(os.path.normpath(str(tmp_path)))


@pytest.mark.asyncio
async def test_windows_pwd_translates_to_powershell(monkeypatch, tmp_path):
    tool = BashTool()
    captured: dict[str, str] = {}

    async def fake_ps_execute(self, command: str, timeout: int = 30, cwd: str | None = None, on_output=None, **kwargs):
        captured["command"] = command
        return ToolResult(success=True, output=str(tmp_path), error=None)

    monkeypatch.setattr(bash_mod.os, "name", "nt", raising=False)
    monkeypatch.setattr("tools.powershell.PowerShellTool.execute", fake_ps_execute)

    result = await tool.execute(command="pwd", cwd=str(tmp_path), timeout=20)

    assert result.success is True
    assert captured["command"] == "(Get-Location).Path"
