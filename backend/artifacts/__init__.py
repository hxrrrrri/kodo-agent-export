"""Kodo artifact protocol v2.

Provider-neutral artifact rendering. Teaches every LLM the same fence-based
protocol so artifacts work identically whether the active provider is Anthropic,
OpenAI, Gemini, Ollama, Groq, DeepSeek, OpenRouter, Atomic Chat, or a future
OpenAI-compatible provider. No tool-use, no function-calling, no JSON mode —
pure text output every model can emit.
"""

from artifacts.protocol_prompt import (
    ARTIFACT_PROTOCOL_PROMPT,
    build_artifact_system_block,
)
from artifacts.store import ArtifactStore, artifact_store

__all__ = [
    "ARTIFACT_PROTOCOL_PROMPT",
    "build_artifact_system_block",
    "ArtifactStore",
    "artifact_store",
]
