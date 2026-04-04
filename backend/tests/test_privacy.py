from __future__ import annotations

import inspect

from privacy import _strip_user_agent, feature_enabled, sanitize_outbound_headers, telemetry_disabled


def test_telemetry_disabled_flag(monkeypatch):
    monkeypatch.setenv('KODO_NO_TELEMETRY', '1')
    assert telemetry_disabled() is True

    monkeypatch.setenv('KODO_NO_TELEMETRY', '0')
    assert telemetry_disabled() is False


def test_feature_enabled_defaults_on(monkeypatch):
    monkeypatch.delenv('KODO_ENABLE_SMART_ROUTER', raising=False)
    assert feature_enabled('smart_router') is True


def test_sanitize_headers_removes_user_agent(monkeypatch):
    monkeypatch.setenv('KODO_NO_TELEMETRY', '1')
    headers = sanitize_outbound_headers({'User-Agent': 'kodo-test', 'Accept': 'application/json'})
    assert 'User-Agent' not in headers
    assert headers['Accept'] == 'application/json'


def test_strip_user_agent_hook_is_async():
    assert inspect.iscoroutinefunction(_strip_user_agent)
