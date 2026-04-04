from __future__ import annotations

from agent.modes import list_modes, normalize_mode


def test_v8_modes_are_listed():
    keys = [item["key"] for item in list_modes()]
    assert "coordinator" in keys
    assert "bughunter" in keys
    assert "ultraplan" in keys


def test_v8_mode_aliases_resolve():
    assert normalize_mode("coord") == "coordinator"
    assert normalize_mode("hunt") == "bughunter"
    assert normalize_mode("ultra") == "ultraplan"
