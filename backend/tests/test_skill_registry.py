from __future__ import annotations

from skills import registry


def test_skill_registry_reads_frontmatter_description(tmp_path, monkeypatch):
    custom_dir = tmp_path / ".kodo" / "skills"
    bundled_dir = tmp_path / "bundled"
    custom_dir.mkdir(parents=True)
    bundled_dir.mkdir()
    (bundled_dir / "karpathy-guidelines.md").write_text(
        "---\n"
        "name: karpathy-guidelines\n"
        "description: Behavioral guardrails for coding agents.\n"
        "---\n\n"
        "# Karpathy Guidelines\n\n"
        "Fallback body description.",
        encoding="utf-8",
    )

    monkeypatch.setattr(registry, "CUSTOM_SKILLS_DIR", custom_dir)
    monkeypatch.setattr(registry, "SKILLS_DIR", bundled_dir)

    skills = registry.SkillRegistry().list_skills()

    assert skills == [
        {
            "name": "karpathy-guidelines",
            "path": str(bundled_dir / "karpathy-guidelines.md"),
            "description": "Behavioral guardrails for coding agents.",
            "source": "bundled",
        }
    ]


def test_skill_registry_supports_nested_skill_md(tmp_path, monkeypatch):
    custom_dir = tmp_path / ".kodo" / "skills"
    bundled_dir = tmp_path / "bundled"
    nested = custom_dir / "karpathy-guidelines"
    nested.mkdir(parents=True)
    bundled_dir.mkdir()
    (nested / "SKILL.md").write_text(
        "---\n"
        "name: karpathy-guidelines\n"
        "description: Skill imported from a Claude-style pack.\n"
        "---\n\n"
        "# Karpathy Guidelines\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(registry, "CUSTOM_SKILLS_DIR", custom_dir)
    monkeypatch.setattr(registry, "SKILLS_DIR", bundled_dir)

    payload = registry.SkillRegistry().get_skill("karpathy-guidelines")

    assert payload is not None
    assert payload["source"] == "custom"
    assert payload["path"] == str(nested / "SKILL.md")
    assert "Claude-style pack" in payload["content"]


def test_skill_registry_rejects_invalid_skill_names(tmp_path, monkeypatch):
    custom_dir = tmp_path / ".kodo" / "skills"
    bundled_dir = tmp_path / "bundled"
    custom_dir.mkdir(parents=True)
    bundled_dir.mkdir()

    monkeypatch.setattr(registry, "CUSTOM_SKILLS_DIR", custom_dir)
    monkeypatch.setattr(registry, "SKILLS_DIR", bundled_dir)

    assert registry.SkillRegistry().get_skill("../secret") is None
