# Design System Inspired by Canva

## 1. Visual Theme & Atmosphere

Canva is approachable creative power. White canvas (#ffffff) with vivid teal (#00c4cc) primary brand creates energy without intimidation. The design invites everyone to be a designer - no expertise required. Rounded corners (12-16px), playful color pops, and drag-and-drop metaphors define the vocabulary.

**Key Characteristics:**
- White canvas (#ffffff) - clean and inviting
- Vivid teal (#00c4cc) primary brand accent
- Bright purple (#8b5cf6) as secondary creative energy
- Rounded everywhere: 12-16px standard, 20px for featured cards
- Template grid as the hero composition
- Inter Bold at display sizes - confident but approachable

## 2. Color Palette & Roles

**Brand:** Teal #00c4cc | Purple #8b5cf6 | Pink #ec4899
**Surface:** Canvas #ffffff | Light Gray #f8fbff | Card Gray #f1f5f9 | Border #e2e8f0
**Text:** Ink #1f2937 | Body #374151 | Muted #64748b
**Semantic:** Success #10b981 | Error #ef4444 | Warning #f59e0b

## 3. Typography

**All:** Inter, -apple-system, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 56px | 800 | Marketing hero |
| H1 | 40px | 700 | Page titles |
| H2 | 28px | 700 | Section heads |
| H3 | 20px | 600 | Card titles |
| Body | 16px | 400 | Default |
| Caption | 14px | 400 | Metadata |
| Button | 15px | 600 | CTAs |

## 4. Component Stylings

**Primary CTA:** #00c4cc bg, #ffffff text, 12px radius, 12px 28px padding, 15px/600
Hover: #00adb5

**Secondary:** #ffffff bg, 2px #00c4cc border, #00c4cc text
Hover: #f0feff bg

**Template Cards:**
- #ffffff bg, 1px #e2e8f0 border, 12px radius
- Thumbnail image fills top | Category: 12px teal pill | Name: 14px/600 #1f2937
- Hover: 0 4px 16px rgba(0,0,0,0.08), slight scale 1.02

**Navigation:**
- #ffffff bg, 1px #e2e8f0 bottom, 64px height
- Canva logo (teal C mark) left | Templates/Features/Learn/Pricing | Try for free (teal CTA) right

**Color Picker Panel:**
- White bg, #f1f5f9 pill swatches, custom hex input
- Recently used row at top

**Design Grid:**
- Masonry or uniform 3-4 col grid
- Templates as primary discovery surface

## 5. Layout
Spacing base 8px: xs:4 sm:8 md:16 lg:24 xl:32 2xl:48
Max-width: 1280px | Template grid: 4-col desktop, 2-col mobile
Section padding: 80px | Card radius: 12-16px

## 6. Elevation
Flat white > 1px #e2e8f0 border > 0 4px 16px rgba(0,0,0,0.08) hover
Active elements: teal border or teal glow 0 0 0 3px rgba(0,196,204,0.25)

## 7. Key Rules
DO: Rounded corners everywhere | Teal on primary CTAs | Template grid as hero
DO NOT: Sharp corners | Monochrome palette | Dark backgrounds | Complex animations

## 8. Quick Reference
Canvas: #ffffff | Teal: #00c4cc | Purple: #8b5cf6 | Ink: #1f2937 | Muted: #64748b | Border: #e2e8f0
