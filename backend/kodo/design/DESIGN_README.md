# Kodo Design Supremacy Implementation

## Phase 0 Intelligence Analysis

Claude Design is strongest at natural-language HTML generation, vision-backed reference use, design-system ingestion, inline comments, direct copy editing, contextual sliders, drawing annotations, multi-direction exploration, and exports. Its weaknesses are history branching, brittle inline comment handoff, limited direct manipulation, weak Figma round-tripping, mode-switching risk, opaque build progress, vague initial questions, and tool/export separation ambiguity.

Kodo Design addresses these with a backend intent classifier, adaptive question engine, explicit strategy selection, overlay-only canvas tooling, SQLite-backed branchable history, clean export sanitation, automatic audits, code health scoring, and section-marker build streams. The invariant is that iframe content remains generated website HTML; comments, draw layers, selection rectangles, and tweaks controls live outside the iframe.

## Phase 1 Project Map

- Chat to LLM: `frontend/src/components/DesignStudio.tsx` streams through `/api/chat/send`, handled by `backend/api/chat.py` and the agent/provider stack.
- Current Design Studio: React manages project files, messages, iframe preview, inline comment overlay, prompt building, design-system presets, and local linear history.
- HTML creation: model output is parsed by `extractFiles`, assembled by `buildPreviewHtml`, and rendered via iframe `srcDoc`.
- Preview rendering: the iframe is inside `DesignStudio.tsx`; React overlays are absolutely positioned over it.
- Existing tweaks/design systems: `backend/api/design.py` serves render/options/system docs; `backend/api/design_extract.py` extracts URL design tokens.
- New Kodo Design core: `backend/kodo/design/*` adds intent, questions, generation prompt, region patching, tweaks, history, token extraction, accessibility, export, and websocket build events.

## Status

Phase 0 and Phase 1 are captured here and exposed through `/api/design/intelligence/project-map`. Phase 2 through Phase 10 are implemented as backend modules and integrated endpoints; frontend integration uses these endpoints for structured questions, audits, clean export, and history saves. The export path strips Kodo tool nodes before delivery and validates the remaining HTML.
