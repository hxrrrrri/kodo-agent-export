# Contributing to KODO

## Setup
```bash
./setup.sh
```

## Development workflow
```bash
# Backend (in backend/)
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (in frontend/)
npm run dev

# Tests
cd backend && python -m pytest tests/ -q
cd frontend && npm test && npm run typecheck
```

## Pull Request Process
1. Fork the repo, create a feature branch
2. Write tests for new features (backend: pytest, frontend: vitest)
3. Run `ruff check .` and `mypy . --ignore-missing-imports` - zero errors
4. Run `npm run typecheck` and `npm test` - all passing
5. Update CHANGELOG.md under [Unreleased]
6. Open PR with a clear description

## Code standards
- Python: `from __future__ import annotations`, full type hints, async I/O
- TypeScript: strict mode, no `any` except in legacy integration points
- No new required backend deps without discussion
- Feature flags for all opt-in capabilities (KODO_ENABLE_*)
