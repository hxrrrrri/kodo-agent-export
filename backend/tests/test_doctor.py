from __future__ import annotations

from pathlib import Path

import pytest

import doctor


@pytest.mark.asyncio
async def test_runtime_checks_fail_without_provider_key(monkeypatch, tmp_path):
    monkeypatch.setattr(doctor, 'feature_enabled', lambda _: True)
    for key in [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GEMINI_API_KEY',
        'DEEPSEEK_API_KEY',
        'GROQ_API_KEY',
        'OPENROUTER_API_KEY',
    ]:
        monkeypatch.delenv(key, raising=False)

    mem = tmp_path / 'MEMORY.md'
    mem.write_text('memory', encoding='utf-8')
    monkeypatch.setattr(doctor, 'GLOBAL_MEMORY_FILE', mem)
    monkeypatch.setattr(doctor, 'KODO_DIR', tmp_path)

    async def fake_load_memory(project_dir):
        return 'ok'

    monkeypatch.setattr(doctor.memory_manager, 'load_memory', fake_load_memory)

    checks = await doctor.run_runtime_checks()
    provider_check = next((check for check in checks if check.name == 'provider_keys'), None)
    assert provider_check is not None
    assert provider_check.passed is False


@pytest.mark.asyncio
async def test_runtime_checks_accept_valid_permission_and_tokens(monkeypatch, tmp_path):
    monkeypatch.setattr(doctor, 'feature_enabled', lambda _: True)
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setenv('MAX_TOKENS', '8192')
    monkeypatch.setenv('PERMISSION_MODE', 'ask')

    mem = tmp_path / 'MEMORY.md'
    mem.write_text('memory', encoding='utf-8')
    monkeypatch.setattr(doctor, 'GLOBAL_MEMORY_FILE', mem)
    monkeypatch.setattr(doctor, 'KODO_DIR', tmp_path)

    async def fake_load_memory(project_dir):
        return 'ok'

    monkeypatch.setattr(doctor.memory_manager, 'load_memory', fake_load_memory)

    checks = await doctor.run_runtime_checks()
    permission_check = next((check for check in checks if check.name == 'permission_mode'), None)
    max_tokens_check = next((check for check in checks if check.name == 'max_tokens'), None)
    assert permission_check is not None and permission_check.passed is True
    assert max_tokens_check is not None and max_tokens_check.passed is True


@pytest.mark.asyncio
async def test_run_report_writes_json_report(monkeypatch, tmp_path):
    monkeypatch.setattr(doctor, 'feature_enabled', lambda _: True)
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')

    mem = tmp_path / 'MEMORY.md'
    mem.write_text('memory', encoding='utf-8')
    monkeypatch.setattr(doctor, 'GLOBAL_MEMORY_FILE', mem)
    monkeypatch.setattr(doctor, 'KODO_DIR', tmp_path)
    monkeypatch.setattr(doctor, 'REPORTS_DIR', tmp_path / 'reports')
    monkeypatch.setattr(doctor, 'DOCTOR_REPORT_FILE', tmp_path / 'reports' / 'doctor.json')

    async def fake_load_memory(project_dir):
        return 'ok'

    monkeypatch.setattr(doctor.memory_manager, 'load_memory', fake_load_memory)

    payload = await doctor.run_report()
    report_path = Path(payload['report_path'])
    assert report_path.exists()
    assert payload['summary']['total'] >= 1
