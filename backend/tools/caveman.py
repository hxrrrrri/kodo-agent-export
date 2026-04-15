from __future__ import annotations

from pathlib import Path
from typing import Any

from caveman import (
    build_help_card,
    build_stats,
    compress_markdown,
    compress_markdown_file,
    get_default_mode,
    normalize_mode,
    validate_compression,
)
from privacy import feature_enabled

from .base import BaseTool, ToolResult
from .path_guard import enforce_allowed_path


def _enabled() -> bool:
    return feature_enabled("CAVEMAN", default="0")


class CavemanTool(BaseTool):
    name = "caveman"
    description = (
        "Caveman utility suite: status/help, markdown compression, and compression validation. "
        "Use when user asks for caveman mode tooling or caveman file compression."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["status", "help", "compress_text", "compress_file", "validate"],
                "description": "Caveman action to perform",
            },
            "mode": {
                "type": "string",
                "enum": ["lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-full", "wenyan-ultra"],
                "description": "Compression/mode level where relevant",
                "default": "full",
            },
            "text": {
                "type": "string",
                "description": "Source markdown text for compress_text action",
            },
            "path": {
                "type": "string",
                "description": "File path for compress_file action",
            },
            "create_backup": {
                "type": "boolean",
                "description": "Whether to create <name>.original.<ext> backup for compress_file",
                "default": True,
            },
            "original": {
                "type": "string",
                "description": "Original text for validate action",
            },
            "compressed": {
                "type": "string",
                "description": "Compressed text for validate action",
            },
        },
        "required": ["action"],
    }

    async def execute(
        self,
        action: str,
        mode: str = "full",
        text: str | None = None,
        path: str | None = None,
        create_backup: bool = True,
        original: str | None = None,
        compressed: str | None = None,
        **kwargs: Any,
    ) -> ToolResult:
        if not _enabled():
            return ToolResult(success=False, output="", error="caveman is disabled. Set KODO_ENABLE_CAVEMAN=1.")

        action_key = str(action or "").strip().lower()
        normalized_mode = normalize_mode(mode) or "full"
        if normalized_mode == "off":
            normalized_mode = "full"

        if action_key == "status":
            default_mode = get_default_mode()
            return ToolResult(
                success=True,
                output=(
                    "Caveman tool is enabled.\n"
                    f"Default mode: {default_mode}\n"
                    "Supported modes: lite, full, ultra, wenyan-lite, wenyan-full, wenyan-ultra"
                ),
                metadata={"enabled": True, "default_mode": default_mode},
            )

        if action_key == "help":
            return ToolResult(success=True, output=build_help_card())

        if action_key == "compress_text":
            source = str(text or "")
            if not source.strip():
                return ToolResult(success=False, output="", error="text is required for compress_text")

            result = compress_markdown(source, mode=normalized_mode)
            text_stats = build_stats(source, result)
            return ToolResult(
                success=True,
                output=result,
                metadata={
                    "mode": normalized_mode,
                    "original_words": text_stats.original_words,
                    "compressed_words": text_stats.compressed_words,
                    "saved_words": text_stats.saved_words,
                    "saved_percent": text_stats.saved_percent,
                },
            )

        if action_key == "compress_file":
            if not path:
                return ToolResult(success=False, output="", error="path is required for compress_file")
            try:
                safe_path = enforce_allowed_path(path)
                payload = compress_markdown_file(
                    Path(safe_path),
                    mode=normalized_mode,
                    create_backup=bool(create_backup),
                )
            except Exception as exc:
                return ToolResult(success=False, output="", error=str(exc))

            raw_stats = payload.get("stats")
            file_stats = raw_stats if isinstance(raw_stats, dict) else {}
            return ToolResult(
                success=True,
                output=(
                    f"Compressed file: {payload.get('path')}\n"
                    f"Backup: {payload.get('backup_path') or '(not created)'}\n"
                    f"Saved words: {file_stats.get('saved_words')} ({file_stats.get('saved_percent')}%)"
                ),
                metadata=payload,
            )

        if action_key == "validate":
            source_original = str(original or "")
            source_compressed = str(compressed or "")
            if not source_original.strip() or not source_compressed.strip():
                return ToolResult(success=False, output="", error="original and compressed are required for validate")

            validation_result = validate_compression(source_original, source_compressed)
            return ToolResult(
                success=validation_result.is_valid,
                output=(
                    "Compression validation passed."
                    if validation_result.is_valid
                    else "Compression validation failed."
                ),
                error=None if validation_result.is_valid else "; ".join(validation_result.errors),
                metadata={"warnings": validation_result.warnings},
            )

        return ToolResult(
            success=False,
            output="",
            error="Unsupported action. Use one of: status, help, compress_text, compress_file, validate.",
        )

