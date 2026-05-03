from __future__ import annotations

import pytest

import commands.router as commands_router
from agent import prompt_builder
from project_context import build_project_context_prompt, get_project_command
from skills import registry


def test_project_context_prompt_includes_rules_and_indexes(tmp_path):
    project = tmp_path / "repo"
    rules = project / ".kodo" / "rules"
    skills = project / ".kodo" / "skills" / "ship-skill"
    agents = project / ".kodo" / "agents"
    commands = project / ".kodo" / "commands"
    rules.mkdir(parents=True)
    skills.mkdir(parents=True)
    agents.mkdir(parents=True)
    commands.mkdir(parents=True)

    (project / "KODO.md").write_text("# Project\n\nProvider-neutral instructions.", encoding="utf-8")
    (rules / "backend.md").write_text(
        "---\nname: backend\ndescription: Backend rules.\nglobs: backend/**/*.py\n---\n\n# Backend\n\nKeep APIs provider-neutral.",
        encoding="utf-8",
    )
    (skills / "SKILL.md").write_text(
        "---\nname: ship-skill\ndescription: Ship safely.\n---\n\n# Ship Skill\n",
        encoding="utf-8",
    )
    (agents / "reviewer.md").write_text(
        "---\nname: reviewer\ndescription: Review diffs.\n---\n\n# Reviewer\n",
        encoding="utf-8",
    )
    (commands / "ship.md").write_text(
        "---\nname: ship\ndescription: Run ship flow.\n---\n\n# Ship\n",
        encoding="utf-8",
    )

    prompt = build_project_context_prompt(str(project))

    assert "PROJECT KODO CONTEXT" in prompt
    assert "Provider-neutral instructions" in prompt
    assert "`backend` (globs: backend/**/*.py): Backend rules." in prompt
    assert "Keep APIs provider-neutral." in prompt
    assert "`ship-skill`: Ship safely." in prompt
    assert "`reviewer`: Review diffs." in prompt
    assert "`ship`: Run ship flow." in prompt


@pytest.mark.asyncio
async def test_system_prompt_includes_project_context(tmp_path, monkeypatch):
    project = tmp_path / "repo"
    rules = project / ".kodo" / "rules"
    rules.mkdir(parents=True)
    (rules / "provider.md").write_text("# Provider\n\nUse provider-neutral markdown.", encoding="utf-8")

    async def fake_load_memory(project_dir):
        return ""

    monkeypatch.setattr(prompt_builder.memory_manager, "load_memory", fake_load_memory)

    prompt = await prompt_builder.build_system_prompt(project_dir=str(project), mode="execute")

    assert "PROJECT KODO CONTEXT" in prompt
    assert "Use provider-neutral markdown." in prompt


def test_skill_registry_prefers_project_skills(tmp_path, monkeypatch):
    project = tmp_path / "repo"
    project_skill = project / ".kodo" / "skills" / "local-skill"
    custom_dir = tmp_path / ".kodo-home" / "skills"
    bundled_dir = tmp_path / "bundled"
    project_skill.mkdir(parents=True)
    custom_dir.mkdir(parents=True)
    bundled_dir.mkdir()

    (project_skill / "SKILL.md").write_text(
        "---\nname: local-skill\ndescription: Project version.\n---\n\n# Project Skill\n",
        encoding="utf-8",
    )
    (custom_dir / "local-skill.md").write_text("# Custom Skill\n\nCustom version.", encoding="utf-8")

    monkeypatch.setattr(registry, "CUSTOM_SKILLS_DIR", custom_dir)
    monkeypatch.setattr(registry, "SKILLS_DIR", bundled_dir)

    skills = registry.SkillRegistry().list_skills(project_dir=str(project))
    payload = registry.SkillRegistry().get_skill("local-skill", project_dir=str(project))

    assert skills[0]["name"] == "local-skill"
    assert skills[0]["source"] == "project"
    assert payload is not None
    assert payload["source"] == "project"
    assert "Project Skill" in payload["content"]


@pytest.mark.asyncio
async def test_project_command_can_run_directly(tmp_path):
    project = tmp_path / "repo"
    commands = project / ".kodo" / "commands"
    commands.mkdir(parents=True)
    (commands / "ship.md").write_text(
        "---\nname: ship\ndescription: Ship flow.\n---\n\n# Ship\n\nRun tests and summarize.",
        encoding="utf-8",
    )

    command = get_project_command(str(project), "ship")
    result = await commands_router.execute_command("/ship backend only", session_id="s1", project_dir=str(project))

    assert command is not None
    assert result.name == "ship"
    assert result.run_prompt is not None
    assert "[Project command: /ship]" in result.run_prompt
    assert "backend only" in result.run_prompt
