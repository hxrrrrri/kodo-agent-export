# Checkpoint Recovery

Use checkpoints to create safe restore points during risky changes.

## Steps
- Before large edits, create a named checkpoint: `/checkpoint <label>`.
- Use `/checkpoint list` to inspect available restore points.
- Restore only with explicit confirmation: `/checkpoint restore <id> --yes`.
- After restore, verify expected message count and session continuity.

## Output
- Checkpoint created or restored, with id and label.
- Quick verification summary of session state.
- Next safe action to continue work.
