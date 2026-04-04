from pathlib import Path
from typing import Any


SKILLS_DIR = Path(__file__).resolve().parent / "bundled"
CUSTOM_SKILLS_DIR = Path.home() / ".kodo" / "skills"


def _read_description(content: str) -> str:
    for line in content.splitlines():
        text = line.strip()
        if not text:
            continue
        if text.startswith("#"):
            continue
        return text
    return ""


class SkillRegistry:
    def __init__(self) -> None:
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        CUSTOM_SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    def list_skills(self) -> list[dict[str, Any]]:
        skills: list[dict[str, Any]] = []
        seen: set[str] = set()

        def _collect(paths: list[Path], source: str) -> None:
            for path in paths:
                name = path.stem
                if name in seen:
                    continue
                try:
                    content = path.read_text(encoding="utf-8")
                except Exception:
                    continue

                seen.add(name)
                skills.append({
                    "name": name,
                    "path": str(path),
                    "description": _read_description(content),
                    "source": source,
                })

        _collect(sorted(CUSTOM_SKILLS_DIR.glob("*.md")), "custom")
        _collect(sorted(SKILLS_DIR.glob("*.md")), "bundled")

        return skills

    def get_skill(self, name: str) -> dict[str, Any] | None:
        skill_name = name.strip()
        if not skill_name:
            return None

        path = CUSTOM_SKILLS_DIR / f"{skill_name}.md"
        if not path.exists():
            path = SKILLS_DIR / f"{skill_name}.md"
        if not path.exists():
            return None
        content = path.read_text(encoding="utf-8")
        return {
            "name": skill_name,
            "path": str(path),
            "content": content,
            "source": "custom" if str(path).startswith(str(CUSTOM_SKILLS_DIR)) else "bundled",
        }


skill_registry = SkillRegistry()
