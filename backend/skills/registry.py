from pathlib import Path
from typing import Any


SKILLS_DIR = Path(__file__).resolve().parent / "bundled"


class SkillRegistry:
    def __init__(self) -> None:
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    def list_skills(self) -> list[dict[str, Any]]:
        skills: list[dict[str, Any]] = []
        for path in sorted(SKILLS_DIR.glob("*.md")):
            name = path.stem
            description = ""
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                continue

            for line in content.splitlines():
                text = line.strip()
                if not text:
                    continue
                if text.startswith("#"):
                    continue
                description = text
                break

            skills.append({
                "name": name,
                "path": str(path),
                "description": description,
            })
        return skills

    def get_skill(self, name: str) -> dict[str, Any] | None:
        skill_name = name.strip()
        if not skill_name:
            return None
        path = SKILLS_DIR / f"{skill_name}.md"
        if not path.exists():
            return None
        content = path.read_text(encoding="utf-8")
        return {
            "name": skill_name,
            "path": str(path),
            "content": content,
        }


skill_registry = SkillRegistry()
