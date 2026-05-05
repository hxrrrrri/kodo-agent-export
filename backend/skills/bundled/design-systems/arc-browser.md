# Design System Inspired by Arc Browser

## 1. Visual Theme & Atmosphere

Arc Browser rejects the browser as a utility tool and presents it as a creative, personal space. The design uses deep purple-charcoal canvas (#1c1c2e) with vivid gradient identity flowing from hot pink (#e040fb) through violet (#7c3aed) to deep blue. The sidebar is the defining UI element - wide, colorful, and central to the experience.

The aesthetic is confident and expressive: not gaming-dark, not enterprise-neutral, but a creative-professional middle ground. Thick gradient fills, rounded components (16-20px radius), and playful micro-interactions coexist with precise utility density.

**Key Characteristics:**
- Deep purple-charcoal canvas (#1c1c2e) as primary background
- Vivid gradient identity: #e040fb -> #7c3aed -> #4f46e5
- Sidebar-centric layout with colorful space indicators
- 16-20px border-radius throughout - rounded, not sharp
- Expressive gradient fills on primary CTAs and highlights
- Personal space metaphors: boosts, spaces, folders, pinned tabs

## 2. Color Palette & Roles

**Identity Gradient:** Hot Pink #e040fb | Violet #7c3aed | Deep Blue #4f46e5
**Surface:** Canvas #1c1c2e | Sidebar #16162a | Card #252540 | Elevated #2e2e50
**Border:** #3a3a5c (standard) | #4a4a6e (hover/active)
**Text:** Primary #f0eeff | Secondary #b0a8d4 | Muted #6e6a8a
**Semantic:** Success #4ade80 | Error #f87171 | Warning #fb923c | Info #60a5fa

## 3. Typography

**All:** Inter, -apple-system, sans-serif (Arc uses system fonts with custom weights)
Code: JetBrains Mono, SFMono-Regular, Menlo, monospace

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 48px | 800 | Landing/marketing |
| H1 | 32px | 700 | Page titles |
| H2 | 22px | 600 | Section heads |
| Body | 15px | 400 | Default text |
| Caption | 13px | 400 | Metadata |
| Label | 11px | 600 | Uppercase tags |

## 4. Component Stylings

**Primary CTA (Gradient):**
- Background: linear-gradient(135deg, #e040fb, #7c3aed, #4f46e5)
- Text: #ffffff | Border-radius: 12px | Padding: 12px 28px | Font: 15px/600
- Hover: 0 4px 20px rgba(124,58,237,0.4) glow

**Secondary Button:**
- Background: #252540 | Border: 1px solid #3a3a5c
- Text: #f0eeff | Radius: 12px | Hover: border #7c3aed

**Space Cards (Sidebar):**
- Background: gradient from space accent color, dark to transparent
- Border-radius: 14px | Padding: 12px | Space icon + name
- Active: gradient glow border 1px

**Command Palette:**
- Background: #252540 | Backdrop-filter: blur(20px)
- Border: 1px #3a3a5c | Border-radius: 16px
- Input: 15px/400, #b0a8d4 placeholder
- Results: 40px rows, hover #2e2e50, active item: violet left border

**Tab Indicators:**
- Colored dot per space: matches space gradient accent
- Pinned: star icon | Playing: audio bars animation

## 5. Layout

Spacing base 8px: xs:4 sm:8 md:16 lg:24 xl:32 2xl:48
Sidebar: 240px fixed left | Main: fluid
Border radius throughout: 16-20px | Cards: 14px | Buttons: 12px
Max-width: 1200px (marketing pages)

## 6. Elevation
Base #1c1c2e > Card #252540 > Elevated #2e2e50
Glow: 0 4px 20px rgba(124,58,237,0.3) on primary elements
Blur: backdrop-filter blur(20px) on overlays and command palette

## 7. Key Rules
DO: Gradient fills on primary CTAs | Rounded corners 12-20px | Sidebar-centric layout
DO NOT: Sharp corners | Flat monochrome buttons | Gray placeholder identity

## 8. Responsive
Sidebar collapses at <768px | Full-screen drawer on mobile

## 9. Quick Reference
Canvas: #1c1c2e | Sidebar: #16162a | Card: #252540 | Border: #3a3a5c
Primary gradient: #e040fb -> #7c3aed -> #4f46e5
Text: #f0eeff | Muted: #6e6a8a | Body: #b0a8d4
