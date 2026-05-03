---
name: frontend-react
description: Rules for React, TypeScript, UI panels, and artifact runtime changes.
globs: frontend/src/**/*.{ts,tsx,css}
---

# Frontend React Rules

- Match existing component structure and state management before introducing new abstractions.
- Keep operational UI dense, readable, and useful for repeated work.
- Avoid decorative layout changes unless the user asked for UI polish.
- Keep text inside controls short and responsive.
- Prefer existing API helpers and store patterns.
- Add focused component or hook tests when behavior changes.
