# Extension Development

Implement and validate VS Code extension behavior end-to-end.

## Steps
- Define user-facing commands, keybindings, and settings in `package.json`.
- Keep extension code resilient: clear errors, logging, and panel lifecycle handling.
- Prefer persistent panel behavior (`retainContextWhenHidden`) for chat workflows.
- Validate by compiling TypeScript and smoke-testing each command path.

## Output
- Manifest updates and command coverage.
- Runtime behavior summary (panel, actions, settings).
- Validation results and remaining gaps.
