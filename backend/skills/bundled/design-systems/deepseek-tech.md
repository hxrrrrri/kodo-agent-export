# Design System Inspired by DeepSeek

## 1. Visual Theme & Atmosphere

DeepSeek is dark-first technical minimalism. Near-black canvas (#050507) communicates infrastructure software seriousness. Blue-teal (#4B9EFF) is the sole accent. Code is first-class: JetBrains Mono appears at hero scale as a design element demonstrating technical capability.

**Key Characteristics:**
- Near-black canvas (#050507) - flat purposeful dark
- Blue-teal (#4B9EFF) accent exclusively on CTAs, logos, active UI
- Cool gray text: #e6eaf3 primary, #a8b3cf secondary
- Monospace at hero scale in technical sections
- Benchmark tables and API specs as primary content
- 1px #2a2d3e borders on all dark surfaces

## 2. Color Palette & Roles

**Accent:** Blue Teal #4B9EFF (CTAs, logo) | Blue Muted rgba(75,158,255,0.15) (selected rows)
**Surface:** Void #050507 | Dark1 #0e0f14 | Dark2 #16181f | Dark3 #1f2130 | Border #2a2d3e
**Text:** Primary #e6eaf3 | Secondary #a8b3cf | Muted #6b7394 | Code #89b4fa
**Semantic:** Success #4ade80 | Warning #fb923c | Error #f87171

## 3. Typography

**All:** Inter, -apple-system, sans-serif | **Code:** JetBrains Mono, SFMono-Regular, Menlo

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Hero H1 | 56px | 700 | -0.02em |
| Section H2 | 36px | 700 | -0.01em |
| Card H3 | 22px | 600 | 0 |
| Body | 15px | 400 | 0 |
| Code Display | 28px | 500 | 0 |
| Code Body | 14px | 400 | 0 |

## 4. Component Stylings

**Primary Button:** #4B9EFF bg, #ffffff text, 8px radius, 10px 22px padding
**Secondary Button:** #1f2130 bg, 1px #3a3d52 border, #e6eaf3 text, hover border #4B9EFF

**Model/Benchmark Cards:**
- #16181f bg, 1px #2a2d3e border, 10px radius, 20px padding
- Model name 18px/600 #e6eaf3 | Version badge: #4B9EFF pill
- Benchmark table with JetBrains Mono inside | Best scores: #4B9EFF text

**Navigation:** #0e0f14 bg, 1px #2a2d3e bottom, 60px height
Blue logo mark left | 14px/500 #a8b3cf links, active #4B9EFF

**Benchmark Tables:**
- Header: #1f2130, 12px/500 uppercase #a8b3cf
- Rows: alternating #16181f/#0e0f14, 1px #2a2d3e borders
- Best cell: #4B9EFF text or rgba(75,158,255,0.15) bg

**Code Blocks:** #0e0f14 bg, 1px #2a2d3e border, 8px radius, 20px padding
JetBrains Mono 14px | keywords #89b4fa, strings #a3e635, functions #4B9EFF

## 5. Layout
Max-width: 1280px | 80px section padding | Hero: single centered column max 720px
Doc sidebar: 260px fixed + fluid main | Feature grid: 3-up desktop, 2-up tablet

## 6. Elevation
Base #050507 > Surface #16181f > Elevated #1f2130 + border
Focus: 2px rgba(75,158,255,0.5) | CTA glow: 0 0 20px rgba(75,158,255,0.15)

## 7. Key Rules
DO: #050507 root canvas | Code as hero content | #4B9EFF sparingly | JetBrains Mono at scale
DO NOT: Warm dark backgrounds | illustrations | decorative elements | radius >10px

## 8. Responsive
Mobile <768px: hamburger, hero 56->32px, horizontal-scroll tables

## 9. Quick Reference
Canvas: #050507 | Surface: #16181f | Elevated: #1f2130 | Accent: #4B9EFF | Border: #2a2d3e
Primary: #e6eaf3 | Body: #a8b3cf | Muted: #6b7394
