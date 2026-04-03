from __future__ import annotations

import os

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def _headers() -> dict[str, str]:
    token = os.getenv('API_AUTH_TOKEN', '').strip()
    if not token:
        return {}
    return {'Authorization': f'Bearer {token}'}


def test_smoke_health_live():
    res = client.get('/health/live')
    assert res.status_code == 200
    assert res.json().get('status') == 'ok'


def test_smoke_doctor_runtime_json():
    res = client.get('/api/doctor/runtime', headers=_headers())
    assert res.status_code == 200
    payload = res.json()
    assert 'checks' in payload
    assert isinstance(payload['checks'], list)


def test_smoke_provider_endpoints_json():
    discover = client.get('/api/providers/discover', headers=_headers())
    status = client.get('/api/providers/status', headers=_headers())

    assert discover.status_code == 200
    assert status.status_code == 200
    assert 'providers' in discover.json()
    assert 'mode' in status.json()
