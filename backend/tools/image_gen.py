from __future__ import annotations

import os
from typing import Any

from privacy import build_httpx_async_client, feature_enabled

from .base import BaseTool, ToolResult


class ImageGenTool(BaseTool):
    name = "image_gen"
    description = (
        "Generate an image from a text prompt using DALL-E 3. "
        "Returns the image URL and revised prompt metadata. "
        "Use when the user explicitly asks to create, draw, or generate an image."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Detailed description of the image to generate",
            },
            "size": {
                "type": "string",
                "enum": ["1024x1024", "1792x1024", "1024x1792"],
                "description": "Image dimensions (default: 1024x1024)",
                "default": "1024x1024",
            },
            "quality": {
                "type": "string",
                "enum": ["standard", "hd"],
                "description": "Image quality (default: standard)",
                "default": "standard",
            },
        },
        "required": ["prompt"],
    }

    async def execute(
        self,
        prompt: str,
        size: str = "1024x1024",
        quality: str = "standard",
        **kwargs: Any,
    ) -> ToolResult:
        if not feature_enabled("IMAGE_GEN", default="0"):
            return ToolResult(
                success=False,
                output="",
                error="Image generation is disabled. Set KODO_ENABLE_IMAGE_GEN=1.",
            )

        prompt_text = prompt.strip()
        if not prompt_text:
            return ToolResult(success=False, output="", error="prompt is required")

        openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not openai_key:
            return ToolResult(
                success=False,
                output="",
                error="OPENAI_API_KEY is required for image generation.",
            )

        if size not in {"1024x1024", "1792x1024", "1024x1792"}:
            size = "1024x1024"
        if quality not in {"standard", "hd"}:
            quality = "standard"

        payload = {
            "model": "dall-e-3",
            "prompt": prompt_text,
            "n": 1,
            "size": size,
            "quality": quality,
            "response_format": "url",
        }
        headers = {
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json",
        }

        try:
            async with build_httpx_async_client(timeout=60.0, headers=headers) as client:
                response = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"Image generation failed: {exc}")

        rows = data.get("data") if isinstance(data, dict) else None
        if not isinstance(rows, list) or not rows:
            return ToolResult(success=False, output="", error="Image generation failed: empty response")

        first = rows[0] if isinstance(rows[0], dict) else {}
        url = str(first.get("url", "")).strip()
        revised_prompt = str(first.get("revised_prompt", prompt_text)).strip() or prompt_text

        if not url:
            return ToolResult(success=False, output="", error="Image generation failed: response missing URL")

        return ToolResult(
            success=True,
            output=f"Image generated successfully.\nURL: {url}\nRevised prompt: {revised_prompt}",
            metadata={"url": url, "revised_prompt": revised_prompt, "size": size},
        )
