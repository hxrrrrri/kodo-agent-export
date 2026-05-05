# Design System: Gaming & Esports (Abstract Theme)

## 1. Visual Theme & Atmosphere

Gaming & Esports design is pure black authority with neon energy. High-contrast dark surfaces, aggressive typography (Rajdhani, Bebas Neue, or Impact), and accent colors that glow against void darkness. HUD metaphors, team roster cards, match scoreboards, and tournament brackets are the primary content patterns.

**Key Characteristics:**
- Pure black (#0a0a0a) or very dark (#111111) canvas
- Neon accent: lime (#39ff14) or cyan (#00f0ff) - glowing against dark
- Aggressive display typography: all-caps, wide tracking, geometric sans
- HUD-inspired UI: health bars, stat gauges, bracket trees
- Team colors as accent system (each team has its own color)
- Sharp edges mixed with selective glow effects

## 2. Color Palette & Roles

**Surface:** Canvas #0a0a0a | Panel #111111 | Card #1a1a1a | Elevated #222222
**Border:** #2a2a2a (standard) | #3a3a3a (hover) | #39ff14 (active glow)
**Accent (Lime variant):** Neon Lime #39ff14 | Lime Dim rgba(57,255,20,0.15)
**Accent (Cyan variant):** Neon Cyan #00f0ff | Cyan Dim rgba(0,240,255,0.15)
**Text:** Primary #ffffff | Secondary #cccccc | Muted #666666
**Status:** Victory #39ff14 | Defeat #ff3333 | In Progress #f0b232 | Upcoming #888888

## 3. Typography

**Display:** Rajdhani, Bebas Neue, Impact, Arial Black, sans-serif (ALL-CAPS, condensed)
**Body:** Inter, Arial, sans-serif

| Role | Size | Weight | Style |
|------|------|--------|-------|
| Tournament Name | 80px | 700 | ALL-CAPS, condensed |
| Team Name | 48px | 700 | ALL-CAPS |
| Event Title | 32px | 700 | ALL-CAPS, tracked |
| Player Name | 22px | 700 | ALL-CAPS |
| Stat Label | 14px | 700 | ALL-CAPS, spaced |
| Body | 15px | 400 | sentence case |
| Score | 64px | 900 | Mono, tabular |

## 4. Component Stylings

**Primary CTA:**
- Background: #39ff14 | Text: #0a0a0a | Border-radius: 2px (near-sharp)
- Font: 14px/700 uppercase letter-spacing 0.1em
- Hover: 0 0 16px rgba(57,255,20,0.5) glow

**Team Roster Card:**
- #1a1a1a bg | Left: 3px solid team-color | 12px 16px padding
- Player avatar (48px, team-colored border) | IGN 16px/700 | Role badge
- Stats row: KDA, winrate in neon accent

**Match Scoreboard:**
- Two team columns: team logo + name | Score center: 64px/900 white
- Map/game result: Win/Loss badges | Duration | MVP highlight

**Tournament Bracket:**
- Dark panels connected by lines | Team matchup per bracket slot
- Winner: neon accent border | TBD: gray placeholder

**Navigation:**
- #0a0a0a bg | Logo: neon-accented wordmark | Nav: 14px/700 ALL-CAPS white | CTA: neon button

## 5. Layout
Full-width aggressive layouts | Asymmetric compositions welcome
Hero: dark full-bleed + neon typography overlay | Max-width: 1440px

## 6. Key Rules
DO: All-caps aggressive typography | Neon glow on primary accent | Dark surfaces throughout
DO NOT: Light backgrounds | Soft rounded corners | Pastel colors | Serif fonts

## 7. Quick Reference
Canvas: #0a0a0a | Panel: #111111 | Card: #1a1a1a | Border: #2a2a2a
Neon lime: #39ff14 | Neon cyan: #00f0ff | Primary: #ffffff | Muted: #666666
Display: Rajdhani, Bebas Neue, ALL-CAPS | Body: Inter
