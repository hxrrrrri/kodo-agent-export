# Caveman Compress

Compress markdown/text files while preserving technical content.

Usage:
- `/caveman:compress <path> [mode]`

Behavior:
- Creates a backup file named `<stem>.original<suffix>` by default.
- Preserves fenced code blocks and URLs.
- Rejects non-markdown/non-text files.
- Validates output before saving.
