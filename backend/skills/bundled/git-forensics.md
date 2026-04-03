# Git Forensics

Inspect repository state safely using read-only git operations.

## Steps
- Use `/git status`, `/git log`, and `/git diff` to map active changes.
- Identify risky files (auth, permissions, migrations, API contracts).
- Summarize regressions, not just syntax differences.
- Never propose destructive history edits unless explicitly requested.

## Output
- Current branch state and change hotspots.
- Potential regressions ordered by severity.
- Recommended non-destructive follow-up commands.
