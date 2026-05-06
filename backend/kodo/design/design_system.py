from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True)
class DesignSystemTokens:
    colors: list[str]
    fonts: list[str]
    spacing: list[str]
    radii: list[str]
    components: list[str]

    def to_dict(self) -> dict[str, list[str]]:
        return {
            "colors": self.colors,
            "fonts": self.fonts,
            "spacing": self.spacing,
            "radii": self.radii,
            "components": self.components,
        }


def extract_design_tokens(html: str) -> DesignSystemTokens:
    colors = [color.lower() for color in re.findall(r"#[0-9a-fA-F]{6}", html)]
    fonts = [
        re.sub(r"['\"]", "", family.split(",")[0]).strip()
        for family in re.findall(r"font-family\s*:\s*([^;}{]+)", html, re.IGNORECASE)
    ]
    spacing = re.findall(r"(?:margin|padding|gap)\s*:\s*([^;}{]+)", html, re.IGNORECASE)
    radii = re.findall(r"border-radius\s*:\s*([^;}{]+)", html, re.IGNORECASE)
    components = re.findall(r"<!--\s*SECTION:\s*([a-zA-Z0-9 _/-]+)\s*-->", html, re.IGNORECASE)
    if not components:
        components = re.findall(r"<(header|nav|main|section|article|footer|aside)\b", html, re.IGNORECASE)
    return DesignSystemTokens(
        colors=[value for value, _ in Counter(colors).most_common(20)],
        fonts=[value for value, _ in Counter(font for font in fonts if font).most_common(8)],
        spacing=[value.strip() for value, _ in Counter(spacing).most_common(16)],
        radii=[value.strip() for value, _ in Counter(radii).most_common(12)],
        components=[value.strip().lower() for value, _ in Counter(components).most_common(16)],
    )
