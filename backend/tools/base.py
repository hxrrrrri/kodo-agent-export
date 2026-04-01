from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel


class ToolResult(BaseModel):
    success: bool
    output: str
    error: str | None = None
    metadata: dict[str, Any] = {}


class BaseTool(ABC):
    """Base class for all KŌDO tools — mirrors Claude Code's Tool architecture."""

    name: str
    description: str
    input_schema: dict

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        pass

    def to_anthropic_schema(self) -> dict:
        """Convert to Anthropic API tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }

    def is_dangerous(self, **kwargs) -> bool:
        """Override to flag operations requiring user approval."""
        return False
