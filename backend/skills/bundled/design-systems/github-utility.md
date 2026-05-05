# Design System Inspired by GitHub

## 1. Visual Theme & Atmosphere

GitHub is the canonical developer utility design system. Dark navy canvas (#0d1117) - the definitive developer dark mode. Near-white text (#f0f6fc) with blue tint. Electric blue (#2f81f7) for interactive elements only. Semantic color vocabulary: every hue has strict meaning.

**Key Characteristics:**
- Dark navy canvas (#0d1117) - definitive developer dark mode
- Electric blue (#2f81f7/#58a6ff) for links, active states, CTAs
- Strict semantic colors: green=success, red=danger, purple=merged
- Mona Sans / Inter, 800 for marketing display only
- Information density: 14px body, 12-16px card padding
- 1px #30363d border on every card and container

## 2. Color Palette & Roles

**Action:** Blue #2f81f7 | Blue Link #58a6ff | Blue Muted rgba(47,129,247,0.15)
**Surface:** Canvas #0d1117 | Overlay #161b22 | Inset #010409 | Subtle #21262d
**Border:** Default #30363d | Muted #21262d
**Text:** Primary #f0f6fc | Secondary #8b949e | Muted #6e7681 | Link #58a6ff
**Semantic:** Success #3fb950 | Danger #f85149 | Warning #d29922
**PR States:** Open #388bfd | Merged #a371f7 | Draft #8b949e

## 3. Typography

**All:** Mona Sans (GitHub custom) fallback: Inter, -apple-system, Segoe UI, sans-serif
**Code:** SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Display | 48px | 800 | -0.025em |
| H1 | 32px | 700 | -0.01em |
| H2 | 24px | 700 | -0.005em |
| H3 | 18px | 600 | 0 |
| Body | 14px | 400 | 0 |
| Caption | 12px | 400 | 0 |
| Code | 12-13px | 400 | 0 |

Body at 14px - smaller than most - maximizes information density.

## 4. Component Stylings

**Buttons:**
- Clone/Create (green): #238636 bg, #ffffff text, 6px radius, 5px 16px padding, 1px rgba(240,246,252,0.1) border
- Interactive (blue): #1f6feb bg, #ffffff text
- Default: #21262d bg, 1px #30363d border, #c9d1d9 text, hover #30363d bg
- Danger: #da3633 bg, #ffffff text

**Repo Cards:**
- #161b22 bg, 1px #30363d border, 6px radius, 16px padding
- Repo name: 14px/600 #58a6ff (link) + visibility badge
- Description: 12px/400 #8b949e
- Footer: language color dot + star/fork counts

**Issue/PR List Items:**
- #161b22 bg, 1px #30363d border, 6px radius, 12px 16px row padding
- Status icon (green/red/purple) + title 14px/600 #f0f6fc
- Colored pill labels | Meta: 12px #8b949e
- Hover: #21262d bg

**Navigation:** #161b22 bg, 1px #30363d bottom, 62px height
Octocat + search left | Pull Requests/Issues/Marketplace/Explore | Notifications + avatar right

**Diff View:**
- Added: rgba(63,185,80,0.15) bg, line# rgba(63,185,80,0.3)
- Removed: rgba(248,81,73,0.15) bg, line# rgba(248,81,73,0.3)
- Font: SFMono-Regular 12px | Line numbers: #6e7681

**Contribution Graph:**
- Empty: #161b22 | Level 1: #0e4429 | Level 2: #006d32 | Level 3: #26a641 | Level 4: #39d353
- 10x10px cells, 2px gap, 2px radius

## 5. Layout
Spacing base 4px: 1:4 2:8 3:12 4:16 5:24 6:32 8:48 10:80
Max-width: 1280px | Repo view: 1012px | Sidebar: 260px fixed + fluid main

Border Radius: 2px cells | 4px badges | 6px buttons/cards/inputs | 12px avatars | 999px pills

## 6. Elevation
Base #0d1117 > Surface #161b22 > Overlay #21262d (hover)
Focus: 2px #58a6ff | Modal: 0 8px 24px rgba(1,4,9,0.6)

## 7. Key Rules
DO: Semantic colors strictly | 1px #30363d border on all cards | 14px body density | real GitHub data
DO NOT: Use colors decoratively | round more than 6px | add shadows at rest | use warm tones

## 8. Responsive
Mobile <768px: hamburger, single col, sidebar hidden
Tablet 768-1012px: compact sidebar toggle, 2-col

## 9. Quick Reference
Canvas: #0d1117 | Surface: #161b22 | Hover: #21262d | Border: #30363d
Primary: #f0f6fc | Body: #8b949e | Link: #58a6ff
Open: #388bfd | Merged: #a371f7 | Closed: #f85149 | Success: #3fb950
