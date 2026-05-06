from __future__ import annotations

from pathlib import Path
from typing import Any

from ..types import CapsuleToolResult


BUILTIN_PERSONAS: dict[str, str] = {
    "code-reviewer": "Act as a senior code reviewer. Prioritize correctness, regressions, security, and missing tests. Findings first.",
    "security-auditor": "Act as a security auditor. Trace trust boundaries, secrets, injection risk, authz/authn, and data retention.",
    "architect": "Act as a pragmatic software architect. Optimize for simple boundaries, clear contracts, and maintainable evolution.",
    "tester": "Act as a validation engineer. Build focused test strategy, edge cases, and reproducible verification steps.",
}


class PersonaTool:
    name = "persona"

    async def execute(self, *, name: str, project_dir: str | None = None) -> CapsuleToolResult:
        try:
            key = name.strip().lower()
            content = BUILTIN_PERSONAS.get(key)
            checked: list[str] = []
            if content is None:
                candidates = [
                    Path.home() / ".kodo" / "personas" / f"{key}.md",
                    Path.home() / ".kodo" / "skills" / f"{key}.md",
                ]
                if project_dir:
                    candidates.append(Path(project_dir) / ".kodo" / "personas" / f"{key}.md")
                    candidates.append(Path(project_dir) / ".kodo" / "skills" / f"{key}.md")
                for path in candidates:
                    checked.append(str(path))
                    if path.exists() and path.is_file():
                        content = path.read_text(encoding="utf-8", errors="replace").strip()
                        break
            if not content:
                raise ValueError(f"Persona not found: {name}. Checked: {', '.join(checked) or 'built-ins'}")
            injection = f"<persona name=\"{key}\">\n{content}\n</persona>"
            return CapsuleToolResult(success=True, message=f"Loaded persona {key}", data={"name": key, "content": content, "injection": injection})
        except Exception as exc:
            return CapsuleToolResult(success=False, message=f"Persona failed: {exc}", data={})

    async def cli_handler(self, **kwargs: Any) -> str:
        result = await self.execute(**kwargs)
        return str(result.data.get("injection", result.message))

    async def api_handler(self, **kwargs: Any) -> dict[str, Any]:
        return (await self.execute(**kwargs)).model_dump()

