from __future__ import annotations

import pytest

import tools.image_gen as image_gen_mod
from tools.image_gen import ImageGenTool


@pytest.mark.asyncio
async def test_image_gen_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KODO_ENABLE_IMAGE_GEN", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    tool = ImageGenTool()
    result = await tool.execute(prompt="draw a fox")

    assert result.success is False
    assert "disabled" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_image_gen_requires_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KODO_ENABLE_IMAGE_GEN", "1")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    tool = ImageGenTool()
    result = await tool.execute(prompt="draw a fox")

    assert result.success is False
    assert "openai_api_key" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_image_gen_success_returns_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KODO_ENABLE_IMAGE_GEN", "1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "data": [
                    {
                        "url": "https://example.com/generated.png",
                        "revised_prompt": "A revised prompt",
                    }
                ]
            }

    class _FakeClient:
        async def __aenter__(self) -> "_FakeClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, object]):
            return _FakeResponse()

    monkeypatch.setattr(image_gen_mod, "build_httpx_async_client", lambda **kwargs: _FakeClient())

    tool = ImageGenTool()
    result = await tool.execute(prompt="generate a landscape")

    assert result.success is True
    assert result.metadata.get("url") == "https://example.com/generated.png"
    assert "Image generated successfully" in result.output
