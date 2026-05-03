from __future__ import annotations

import json
from pathlib import Path
from typing import Any


MAX_PROJECT_CONTEXT_CHARS = 14000
MAX_DOC_CHARS = 1800


def parse_frontmatter(content: str) -> tuple[dict[str, str], str]:
    if not content.startswith("---"):
        return {}, content

    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, content

    metadata: dict[str, str] = {}
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return metadata, "\n".join(lines[index + 1 :])
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip('"\'')
        if key:
            metadata[key] = value

    return {}, content


def project_kodo_dir(project_dir: str | None) -> Path | None:
    if not project_dir:
        return None

    root = Path(project_dir).expanduser()
    try:
        root = root.resolve()
    except OSError:
        return None
    if not root.exists() or not root.is_dir():
        return None

    kodo_dir = root / ".kodo"
    if not kodo_dir.exists() or not kodo_dir.is_dir():
        return None
    return kodo_dir


def _read_text(path: Path, max_chars: int = MAX_DOC_CHARS) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n... (truncated)"


def _frontmatter_name(path: Path, metadata: dict[str, str]) -> str:
    name = metadata.get("name", "").strip()
    if name:
        return name
    if path.name.lower() == "skill.md":
        return path.parent.name
    return path.stem


def _markdown_paths(root: Path, section: str) -> list[Path]:
    section_dir = root / section
    if not section_dir.exists() or not section_dir.is_dir():
        return []

    paths = list(section_dir.glob("*.md"))
    if section == "skills":
        paths.extend(section_dir.glob("*/SKILL.md"))
    return sorted(set(paths))


def list_project_markdown(project_dir: str | None, section: str) -> list[dict[str, str]]:
    root = project_kodo_dir(project_dir)
    if root is None:
        return []

    items: list[dict[str, str]] = []
    for path in _markdown_paths(root, section):
        content = _read_text(path)
        if not content:
            continue
        metadata, body = parse_frontmatter(content)
        description = metadata.get("description", "").strip()
        if not description:
            for line in body.splitlines():
                text = line.strip()
                if text and not text.startswith("#"):
                    description = text
                    break
        items.append({
            "name": _frontmatter_name(path, metadata),
            "path": str(path),
            "description": description,
            "globs": metadata.get("globs", "").strip(),
            "content": content,
        })
    return items


def get_project_command(project_dir: str | None, name: str) -> dict[str, str] | None:
    normalized = name.strip().lstrip("/")
    if not normalized:
        return None

    for item in list_project_markdown(project_dir, "commands"):
        if item["name"] == normalized:
            return item
    return None


def _settings_summary(root: Path) -> str:
    path = root / "settings.json"
    if not path.exists():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    if not isinstance(payload, dict):
        return ""

    lines = ["## Project Settings"]
    model = payload.get("model")
    permissions = payload.get("permissions")
    hooks = payload.get("hooks")
    if model:
        lines.append(f"- Preferred model profile: {model}")
    if permissions:
        lines.append(f"- Permissions policy: {json.dumps(permissions, ensure_ascii=True)}")
    if hooks:
        lines.append("- Hook registry exists. Treat hooks as deterministic project automation; inspect before changing.")
    return "\n".join(lines) if len(lines) > 1 else ""


def _mcp_summary(root: Path) -> str:
    candidates = [root / "mcp.json", root.parent / ".mcp.json"]
    for path in candidates:
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        servers = payload.get("mcpServers") or payload.get("servers") or {}
        if isinstance(servers, dict) and servers:
            names = ", ".join(sorted(str(name) for name in servers.keys()))
            return f"## Project MCP\n- Project MCP config found at `{path.name}` with servers: {names}."
        return f"## Project MCP\n- Project MCP config found at `{path.name}`."
    return ""


def _append_doc_sections(lines: list[str], title: str, items: list[dict[str, str]], include_content: bool) -> None:
    if not items:
        return

    lines.append(f"## {title}")
    for item in items:
        descriptor = f"- `{item['name']}`"
        if item.get("globs"):
            descriptor += f" (globs: {item['globs']})"
        if item.get("description"):
            descriptor += f": {item['description']}"
        lines.append(descriptor)
        if include_content:
            lines.append("")
            lines.append(item["content"].strip())
            lines.append("")


def build_project_context_prompt(project_dir: str | None, max_chars: int = MAX_PROJECT_CONTEXT_CHARS) -> str:
    root = project_kodo_dir(project_dir)
    if root is None:
        return ""

    lines: list[str] = [
        "PROJECT KODO CONTEXT",
        "These project-local instructions are provider-neutral. Apply them with any cloud or local model because KODO injects this block into the system prompt.",
        "Project markdown is advisory unless a deterministic KODO tool or hook executes it.",
    ]

    project_doc = _read_text(root.parent / "KODO.md", max_chars=2600)
    if project_doc:
        lines.extend(["## KODO.md", project_doc.strip()])

    readme = _read_text(root / "README.md", max_chars=1800)
    if readme:
        lines.extend(["## .kodo/README.md", readme.strip()])

    _append_doc_sections(lines, "Project Rules", list_project_markdown(project_dir, "rules"), include_content=True)
    _append_doc_sections(lines, "Project Skills", list_project_markdown(project_dir, "skills"), include_content=False)
    _append_doc_sections(lines, "Project Agents", list_project_markdown(project_dir, "agents"), include_content=False)
    _append_doc_sections(lines, "Project Commands", list_project_markdown(project_dir, "commands"), include_content=False)
    _append_doc_sections(lines, "Output Styles", list_project_markdown(project_dir, "output-styles"), include_content=False)

    settings = _settings_summary(root)
    if settings:
        lines.append(settings)

    mcp = _mcp_summary(root)
    if mcp:
        lines.append(mcp)

    rendered = "\n\n".join(part for part in lines if part.strip())
    if len(rendered) <= max_chars:
        return rendered
    return rendered[:max_chars].rstrip() + "\n... (project context truncated)"
