# Design System Inspired by shadcn/ui

## 1. Visual Theme & Atmosphere

shadcn/ui is the developer-first component system: extreme minimalism, zero decoration, built for customization. The default theme uses near-black (#09090b) with zinc neutrals and a pure black/white contrast system. No brand colors exist at the system level - the system IS the structure, and color comes from your application layer.

**Key Characteristics:**
- Near-black (#09090b) dark mode / pure white (#ffffff) light mode
- Zinc neutral scale throughout - no decorative color at all
- Zero border-radius variation - consistent 8px (rounded-md) everywhere
- Geist or Inter font - weight 400-600 only
- Component documentation density: code examples, preview panes, CLI commands
- Hairline borders (1px #27272a) as the primary visual element

## 2. Color Palette & Roles

**Dark Mode:**
- Background #09090b | Card #0f0f12 | Popover #0f0f12
- Border #27272a | Input #27272a | Ring #a1a1aa
- Primary #fafafa | Primary Foreground #18181b
- Secondary #27272a | Secondary Foreground #fafafa
- Muted #27272a | Muted Foreground #a1a1aa
- Accent #27272a | Accent Foreground #fafafa

**Light Mode:**
- Background #ffffff | Card #ffffff
- Border #e4e4e7 | Input #e4e4e7
- Primary #18181b | Primary Foreground #fafafa
- Muted #f4f4f5 | Muted Foreground #71717a

## 3. Typography

**All:** Geist Sans (or Inter), system-ui, sans-serif
**Code:** Geist Mono, JetBrains Mono, monospace

| Role | Size | Weight |
|------|------|--------|
| H1 | 36px | 700 |
| H2 | 28px | 600 |
| H3 | 22px | 600 |
| Body | 15px | 400 |
| Small | 13px | 400 |
| Muted | 14px | 400 |
| Code | 13px | 400 |
| Button | 14px | 500 |

## 4. Component Stylings

**Button (Default):**
- Background: #fafafa (dark) / #18181b (light) | Text: #18181b / #fafafa
- Border-radius: 8px | Padding: 8px 16px | Font: 14px/500 | Height: 36px
- Hover: opacity 0.9

**Button (Outline):**
- Background: transparent | Border: 1px #27272a | Same geometry
- Hover: #27272a bg (dark) / #f4f4f5 (light)

**Button (Ghost):**
- No background, no border | Hover: #27272a bg (dark)

**Card:**
- Background: #0f0f12 / #ffffff | Border: 1px #27272a / #e4e4e7
- Border-radius: 12px | Padding: 24px
- Card header 20px/600 | Card description 14px muted

**Input:**
- Background: transparent | Border: 1px #27272a | Border-radius: 8px
- Padding: 8px 12px | Height: 36px | Font: 14px
- Focus: ring 2px #a1a1aa offset 2px

**Navigation (Docs):**
- Left sidebar: 240px fixed, dark/light bg, nav items 14px, active underline or bg
- Content area: centered max-width 740px, generous line height

## 5. Layout
Spacing: Tailwind CSS standard scale (4px base)
Max-width: 740px for docs, 1200px for full pages
Card radius: 12px | Component radius: 8px | Pill: 9999px

## 6. Key Rules
DO: Zinc neutrals only | 1px borders as the primary design element | Code examples prominently
DO NOT: Brand colors at system level | Multiple radius sizes | Decorative gradients | Round buttons full pill

## 7. Quick Reference (Dark Mode)
Background: #09090b | Card: #0f0f12 | Border: #27272a | Ring: #a1a1aa
Primary: #fafafa | Muted: #27272a | Muted-foreground: #a1a1aa
