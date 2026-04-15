from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from caveman.config import normalize_mode


COMPRESSIBLE_EXTENSIONS = {".md", ".markdown", ".txt", ".rst", ""}
SKIP_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".env",
    ".lock",
    ".css",
    ".scss",
    ".html",
    ".xml",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".lua",
    ".ini",
    ".cfg",
    ".csv",
}

MAX_FILE_SIZE_BYTES = 500_000

FENCE_OPEN_REGEX = re.compile(r"^\s{0,3}(`{3,}|~{3,})(.*)$")
INLINE_CODE_REGEX = re.compile(r"`[^`\n]+`")
URL_REGEX = re.compile(r"https?://[^\s)]+")
HEADING_REGEX = re.compile(r"^(#{1,6})\s+(.*)", re.MULTILINE)
ARTICLE_REGEX = re.compile(r"\b(a|an|the)\b", re.IGNORECASE)
FILLER_REGEX = re.compile(
    r"\b(just|really|basically|actually|simply|essentially|generally|very|quite|mostly)\b",
    re.IGNORECASE,
)
HEDGING_REGEXES = [
    re.compile(r"\bit might be worth\b", re.IGNORECASE),
    re.compile(r"\byou could consider\b", re.IGNORECASE),
    re.compile(r"\bit would be good to\b", re.IGNORECASE),
    re.compile(r"\bi think\b", re.IGNORECASE),
]
PHRASE_REPLACEMENTS = [
    (re.compile(r"\bin order to\b", re.IGNORECASE), "to"),
    (re.compile(r"\bmake sure to\b", re.IGNORECASE), "ensure"),
    (re.compile(r"\bthe reason is because\b", re.IGNORECASE), "because"),
]
ULTRA_ABBREVIATIONS = [
    (re.compile(r"\bdatabase\b", re.IGNORECASE), "DB"),
    (re.compile(r"\bconfiguration\b", re.IGNORECASE), "config"),
    (re.compile(r"\brequest\b", re.IGNORECASE), "req"),
    (re.compile(r"\bresponse\b", re.IGNORECASE), "res"),
    (re.compile(r"\bfunction\b", re.IGNORECASE), "fn"),
    (re.compile(r"\bimplementation\b", re.IGNORECASE), "impl"),
]


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[str]
    warnings: list[str]


@dataclass
class CompressionStats:
    original_words: int
    compressed_words: int
    saved_words: int
    saved_percent: float


def _split_fenced_code_blocks(text: str) -> list[tuple[bool, str]]:
    lines = text.splitlines(keepends=True)
    parts: list[tuple[bool, str]] = []
    buffer: list[str] = []
    in_code = False
    fence_char = ""
    fence_len = 0

    for line in lines:
        candidate = line.rstrip("\r\n")
        fence_match = FENCE_OPEN_REGEX.match(candidate)

        if not in_code:
            if fence_match:
                if buffer:
                    parts.append((False, "".join(buffer)))
                    buffer = []
                in_code = True
                fence_char = fence_match.group(1)[0]
                fence_len = len(fence_match.group(1))
            buffer.append(line)
            continue

        buffer.append(line)
        if (
            fence_match
            and fence_match.group(1)[0] == fence_char
            and len(fence_match.group(1)) >= fence_len
            and not fence_match.group(2).strip()
        ):
            parts.append((True, "".join(buffer)))
            buffer = []
            in_code = False
            fence_char = ""
            fence_len = 0

    if buffer:
        parts.append((in_code, "".join(buffer)))

    return parts


def _protect_tokens(text: str) -> tuple[str, dict[str, str]]:
    tokens: dict[str, str] = {}
    index = 0

    def _replace(pattern: re.Pattern[str], source: str) -> str:
        nonlocal index

        def _inject(match: re.Match[str]) -> str:
            nonlocal index
            key = f"__CAVEMAN_TOKEN_{index}__"
            tokens[key] = match.group(0)
            index += 1
            return key

        return pattern.sub(_inject, source)

    with_code = _replace(INLINE_CODE_REGEX, text)
    with_urls = _replace(URL_REGEX, with_code)
    return with_urls, tokens


def _restore_tokens(text: str, tokens: dict[str, str]) -> str:
    restored = text
    for key, value in tokens.items():
        restored = restored.replace(key, value)
    return restored


def _cleanup_spacing(text: str) -> str:
    cleaned = re.sub(r"[ \t]+", " ", text)
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([(\[{])\s+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([)\]}])", r"\1", cleaned)
    return cleaned.strip()


def _compress_inline_text(text: str, mode: str) -> str:
    protected, tokens = _protect_tokens(text)
    compressed = protected

    for pattern, replacement in PHRASE_REPLACEMENTS:
        compressed = pattern.sub(replacement, compressed)

    for regex in HEDGING_REGEXES:
        compressed = regex.sub("", compressed)

    compressed = FILLER_REGEX.sub("", compressed)
    if mode in {"full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"}:
        compressed = ARTICLE_REGEX.sub("", compressed)

    if mode in {"ultra", "wenyan-full", "wenyan-ultra"}:
        compressed = re.sub(r"\b(and|also|additionally|furthermore|however)\b", "", compressed, flags=re.IGNORECASE)
        compressed = re.sub(r"\bbecause\b", "->", compressed, flags=re.IGNORECASE)
        for pattern, replacement in ULTRA_ABBREVIATIONS:
            compressed = pattern.sub(replacement, compressed)

    if mode in {"wenyan-lite", "wenyan-full", "wenyan-ultra"}:
        compressed = re.sub(r"\b(you|your|we|our|i|my)\b", "", compressed, flags=re.IGNORECASE)

    compressed = _cleanup_spacing(compressed)
    return _restore_tokens(compressed, tokens)


def _compress_line(line: str, mode: str) -> str:
    if not line:
        return line

    line_ending = ""
    if line.endswith("\r\n"):
        line_ending = "\r\n"
        core = line[:-2]
    elif line.endswith("\n"):
        line_ending = "\n"
        core = line[:-1]
    else:
        core = line

    if not core.strip():
        return line

    stripped = core.lstrip()
    indent = core[: len(core) - len(stripped)]

    if stripped.startswith("#"):
        return line
    if stripped.startswith("|"):
        return line

    bullet_match = re.match(r"^(\s*(?:[-*+]\s+|\d+\.\s+|>\s+))(.*)$", core)
    if bullet_match:
        prefix = bullet_match.group(1)
        body = bullet_match.group(2)
        return f"{prefix}{_compress_inline_text(body, mode)}{line_ending}"

    return f"{indent}{_compress_inline_text(stripped, mode)}{line_ending}"


def _compress_non_code_segment(segment: str, mode: str) -> str:
    lines = segment.splitlines(keepends=True)
    if not lines:
        return segment

    output: list[str] = []
    in_frontmatter = False
    frontmatter_seen = False

    for idx, line in enumerate(lines):
        stripped = line.strip()
        if idx == 0 and stripped == "---":
            in_frontmatter = True
            frontmatter_seen = True
            output.append(line)
            continue

        if in_frontmatter:
            output.append(line)
            if stripped in {"---", "..."}:
                in_frontmatter = False
            continue

        # Preserve a second frontmatter block only when we already started one at the top.
        if frontmatter_seen and stripped == "---":
            output.append(line)
            continue

        output.append(_compress_line(line, mode))

    return "".join(output)


def compress_markdown(text: str, mode: str = "full") -> str:
    normalized = normalize_mode(mode) or "full"
    if normalized == "off":
        return text

    parts = _split_fenced_code_blocks(text)
    output: list[str] = []
    for is_code, chunk in parts:
        if is_code:
            output.append(chunk)
        else:
            output.append(_compress_non_code_segment(chunk, normalized))
    return "".join(output)


def extract_code_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    for is_code, chunk in _split_fenced_code_blocks(text):
        if is_code:
            blocks.append(chunk)
    return blocks


def extract_urls(text: str) -> set[str]:
    return set(URL_REGEX.findall(text))


def extract_headings(text: str) -> list[tuple[str, str]]:
    return [(level, title.strip()) for level, title in HEADING_REGEX.findall(text)]


def validate_compression(original: str, compressed: str) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    if extract_code_blocks(original) != extract_code_blocks(compressed):
        errors.append("Code blocks are not preserved exactly.")

    original_urls = extract_urls(original)
    compressed_urls = extract_urls(compressed)
    if original_urls != compressed_urls:
        lost = sorted(original_urls - compressed_urls)
        added = sorted(compressed_urls - original_urls)
        errors.append(f"URL mismatch. Lost={lost}, Added={added}")

    original_headings = extract_headings(original)
    compressed_headings = extract_headings(compressed)
    if len(original_headings) != len(compressed_headings):
        errors.append(
            f"Heading count mismatch ({len(original_headings)} vs {len(compressed_headings)})."
        )
    elif original_headings != compressed_headings:
        warnings.append("Heading text changed; original heading text should remain exact.")

    return ValidationResult(is_valid=(len(errors) == 0), errors=errors, warnings=warnings)


def count_words(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def build_stats(original: str, compressed: str) -> CompressionStats:
    original_words = count_words(original)
    compressed_words = count_words(compressed)
    saved_words = max(0, original_words - compressed_words)
    saved_percent = 0.0
    if original_words > 0:
        saved_percent = (saved_words / original_words) * 100
    return CompressionStats(
        original_words=original_words,
        compressed_words=compressed_words,
        saved_words=saved_words,
        saved_percent=round(saved_percent, 2),
    )


def should_compress_path(path: Path) -> bool:
    if not path.is_file():
        return False

    if path.stem.endswith(".original"):
        return False

    ext = path.suffix.lower()
    if ext in SKIP_EXTENSIONS:
        return False
    if ext in COMPRESSIBLE_EXTENSIONS:
        return True

    return False


def compress_markdown_file(path: Path, mode: str = "full", create_backup: bool = True) -> dict[str, object]:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if not path.is_file():
        raise ValueError(f"Not a file: {path}")
    if path.stat().st_size > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File too large to compress safely (max 500KB): {path}")
    if not should_compress_path(path):
        raise ValueError("File type is not compressible (expected markdown/text style content).")

    original = path.read_text(encoding="utf-8", errors="replace")
    compressed = compress_markdown(original, mode=mode)
    validation = validate_compression(original, compressed)
    if not validation.is_valid:
        raise ValueError("Compression validation failed: " + "; ".join(validation.errors))

    backup_path: Path | None = None
    if create_backup:
        suffix = path.suffix or ".md"
        backup_path = path.with_name(f"{path.stem}.original{suffix}")
        if backup_path.exists():
            raise ValueError(f"Backup file already exists: {backup_path}")
        backup_path.write_text(original, encoding="utf-8")

    path.write_text(compressed, encoding="utf-8")
    stats = build_stats(original, compressed)
    return {
        "path": str(path),
        "backup_path": str(backup_path) if backup_path else "",
        "stats": {
            "original_words": stats.original_words,
            "compressed_words": stats.compressed_words,
            "saved_words": stats.saved_words,
            "saved_percent": stats.saved_percent,
        },
        "warnings": validation.warnings,
    }
