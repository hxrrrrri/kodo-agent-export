import os
import re
from enum import Enum
from typing import Callable, Awaitable, TYPE_CHECKING

if TYPE_CHECKING:
    from tools.base import BaseTool


class PermissionMode(str, Enum):
    ASK = "ask"      # Prompt user for dangerous ops (default)
    AUTO = "auto"    # Auto-approve safe ops, prompt dangerous
    YOLO = "yolo"    # No prompts (dangerous but fast)


# Patterns that are ALWAYS blocked regardless of mode
BLOCKED_BASH_PATTERNS = [
    r"rm\s+-rf\s+/",              # rm -rf / (any variant)
    r"rm\s+-rf\s+/\*",            # rm -rf /*
    r"sudo\s+rm\s+-rf",           # sudo rm -rf
    r">\s*/dev/sd[a-z]",          # write to raw disk
    r"mkfs\.",                     # format filesystem
    r":(){ :|:& };:",              # fork bomb
]

BLOCKED_POWERSHELL_PATTERNS = [
    r"Remove-Item\s+.+-Recurse\s+-Force\s+[A-Za-z]:\\\s*$",
    r"Format-Volume\b",
    r"Clear-Disk\b",
    r"Initialize-Disk\b",
    r"diskpart\b",
    r"\\\\\\.\\PhysicalDrive\d+",
]


class PermissionChecker:
    def __init__(self, mode: PermissionMode = PermissionMode.ASK):
        self.mode = mode
        # Callback: (tool_name, input_preview) -> bool (approved)
        self._approval_callback: Callable[[str, str, str], Awaitable[bool]] | None = None

    def set_approval_callback(self, cb: Callable[[str, str, str], Awaitable[bool]]):
        self._approval_callback = cb

    def is_blocked(self, tool_name: str, **kwargs) -> bool:
        """Permanently blocked — no approval can override."""
        if tool_name == "bash":
            cmd = kwargs.get("command", "")
            for pattern in BLOCKED_BASH_PATTERNS:
                if re.search(pattern, cmd, re.IGNORECASE):
                    return True

        if tool_name == "powershell":
            cmd = kwargs.get("command", "")
            for pattern in BLOCKED_POWERSHELL_PATTERNS:
                if re.search(pattern, cmd, re.IGNORECASE):
                    return True
        return False

    async def check(self, tool: "BaseTool", **kwargs) -> tuple[bool, str]:
        """
        Returns (approved: bool, reason: str)
        """
        from tools.base import BaseTool

        # Always-block check
        if self.is_blocked(tool.name, **kwargs):
            return False, "This operation is permanently blocked for safety."

        # YOLO mode — approve everything not blocked
        if self.mode == PermissionMode.YOLO:
            return True, "yolo mode"

        # Check if tool considers this dangerous
        is_dangerous = tool.is_dangerous(**kwargs)

        if not is_dangerous:
            return True, "auto-approved (safe operation)"

        # AUTO mode — only prompts if dangerous
        if self.mode == PermissionMode.AUTO and not is_dangerous:
            return True, "auto-approved"

        # Need user approval
        if self._approval_callback is None:
            # Fail closed for dangerous operations unless a callback is configured.
            return False, "dangerous operation requires interactive approval callback"

        preview = self._build_preview(tool.name, kwargs)
        approved = await self._approval_callback(tool.name, preview, tool.description)
        return approved, "user approved" if approved else "user denied"

    def _build_preview(self, tool_name: str, kwargs: dict) -> str:
        if tool_name in ("bash", "powershell"):
            return kwargs.get("command", "")
        if tool_name in ("file_write", "file_edit"):
            return kwargs.get("path", "") + " (file modification)"
        return str(kwargs)[:200]


# Global singleton
_checker: PermissionChecker | None = None


def get_permission_checker() -> PermissionChecker:
    global _checker
    if _checker is None:
        mode_str = os.getenv("PERMISSION_MODE", "ask")
        mode = PermissionMode(mode_str)
        _checker = PermissionChecker(mode)
    return _checker
