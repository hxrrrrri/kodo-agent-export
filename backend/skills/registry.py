from pathlib import Path
from typing import Any

from project_context import parse_frontmatter, project_kodo_dir


SKILLS_DIR = Path(__file__).resolve().parent / "bundled"
CUSTOM_SKILLS_DIR = Path.home() / ".kodo" / "skills"


def _active_project_dir() -> str | None:
    try:
        from tools.path_guard import get_active_project_dir
    except Exception:
        return None
    return get_active_project_dir()


def _read_description(content: str) -> str:
    metadata, body = parse_frontmatter(content)
    if metadata.get("description"):
        return metadata["description"]

    for line in body.splitlines():
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

    def list_skills(self, project_dir: str | None = None) -> list[dict[str, Any]]:
        skills: list[dict[str, Any]] = []
        seen: set[str] = set()

        def _collect(paths: list[Path], source: str) -> None:
            for path in paths:
                try:
                    content = path.read_text(encoding="utf-8")
                except Exception:
                    continue

                metadata, _ = parse_frontmatter(content)
                name = metadata.get("name") or self._name_from_path(path)
                if name in seen:
                    continue
                if not self._valid_skill_name(name):
                    continue

                seen.add(name)
                skills.append({
                    "name": name,
                    "path": str(path),
                    "description": _read_description(content),
                    "source": source,
                })

        active_project_dir = project_dir or _active_project_dir()
        project_root = project_kodo_dir(active_project_dir)
        if project_root is not None:
            _collect(self._skill_paths(project_root / "skills"), "project")

        _collect(self._skill_paths(CUSTOM_SKILLS_DIR), "custom")
        _collect(self._skill_paths(SKILLS_DIR), "bundled")

        return skills

    def get_skill(self, name: str, project_dir: str | None = None) -> dict[str, Any] | None:
        skill_name = name.strip()
        if not self._valid_skill_name(skill_name):
            return None

        match = self._find_skill(skill_name, project_dir=project_dir)
        if match is None:
            return None
        path, source = match
        content = path.read_text(encoding="utf-8")
        return {
            "name": skill_name,
            "path": str(path),
            "content": content,
            "source": source,
        }

    def _find_skill(self, name: str, project_dir: str | None = None) -> tuple[Path, str] | None:
        roots: list[tuple[Path, str]] = []
        active_project_dir = project_dir or _active_project_dir()
        project_root = project_kodo_dir(active_project_dir)
        if project_root is not None:
            roots.append((project_root / "skills", "project"))
        roots.extend([(CUSTOM_SKILLS_DIR, "custom"), (SKILLS_DIR, "bundled")])

        for root, source in roots:
            for path in self._skill_paths(root):
                try:
                    content = path.read_text(encoding="utf-8")
                except Exception:
                    continue
                metadata, _ = parse_frontmatter(content)
                candidate = metadata.get("name") or self._name_from_path(path)
                if candidate == name:
                    return path, source
        return None

    @staticmethod
    def _skill_paths(root: Path) -> list[Path]:
        paths = list(root.glob("*.md")) + list(root.glob("*/SKILL.md"))
        return sorted(set(paths))

    @staticmethod
    def _name_from_path(path: Path) -> str:
        if path.name.lower() == "skill.md":
            return path.parent.name
        return path.stem

    @staticmethod
    def _valid_skill_name(name: str) -> bool:
        if not name:
            return False
        return all(char.isalnum() or char in {"-", "_"} for char in name)


skill_registry = SkillRegistry()
