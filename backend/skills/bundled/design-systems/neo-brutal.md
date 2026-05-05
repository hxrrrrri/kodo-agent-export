# Design System: Neo Brutal (Abstract Theme)

## 1. Visual Theme & Atmosphere

Neo Brutal is the anti-design design system. Thick black borders everywhere, flat colors, zero border-radius, bold stacked typography. Influenced by brutalist web design but updated with modern flat colors and playful asymmetry. Every card, button, and panel has a visible 2-3px solid black border and a hard box-shadow offset (4px 4px 0 #000).

**Key Characteristics:**
- Off-white (#fffdf2) or white canvas - stark contrast base
- 2-3px solid black borders on every interactive element
- Hard offset shadow: 4px 4px 0 #000 (no blur)
- Zero border-radius (0px) on primary components
- Flat primary colors: yellow (#ffdd00), red (#ff4d00), blue (#0000ff), green (#00cc44)
- Bold condensed typography at oversized scale

## 2. Color Palette & Roles

**Surface:** Canvas #fffdf2 | White #ffffff | Black #111111
**Primary Colors (rotate as accent):**
- Yellow #ffdd00 | Red #ff4d00 | Electric Blue #0000ff | Lime #00cc44 | Hot Pink #ff00aa
**Text:** Black #111111 on all surfaces | White #ffffff on colored bg
**Border:** Solid #111111 (2-3px) | Active: colored border (accent color)

## 3. Typography

**Display:** Impact, Arial Black, Helvetica Neue Condensed, sans-serif (condensed bold)
**Body:** Inter, Arial, sans-serif

| Role | Size | Weight | Style |
|------|------|--------|-------|
| Hero | 96px | 900 | ALL-CAPS, condensed |
| H1 | 64px | 900 | ALL-CAPS |
| H2 | 48px | 700 | Bold |
| H3 | 28px | 700 | Bold |
| Body | 16px | 400 | sentence case |
| Button | 16px | 800 | UPPERCASE |
| Label | 13px | 700 | UPPERCASE |

## 4. Component Stylings

**Primary Button:**
- Yellow (#ffdd00) or red (#ff4d00) bg | #111111 text
- 0px border-radius (sharp) | 2px solid #111111 border
- box-shadow: 4px 4px 0 #111111 | Padding: 14px 28px | Font: 16px/800 UPPERCASE
- Hover: shadow 6px 6px 0 #111111 (grows) | Active: shadow 2px 2px 0 #111111 (compresses)

**Cards:**
- White or yellow (#ffdd00) bg | 2px solid #111111 border
- 0px border-radius | box-shadow: 4px 4px 0 #111111
- Padding: 20px | Title: Impact 24px ALL-CAPS

**Navigation:**
- #111111 bg or #ffdd00 bg | 3px solid #111111 bottom border
- Logo: bold condensed wordmark | Links: uppercase Inter 15px/700 | CTA: accent color button

**Input:**
- White bg | 2px solid #111111 border | 0px radius
- box-shadow: 4px 4px 0 #111111 (on focus) | 14px padding

## 5. Layout
High contrast, asymmetric possible | Max-width: 1200px
Card grid: 3-col | Hard edges everywhere | Section dividers: 2px solid #111111 rule

## 6. Key Rules
DO: 2-3px solid black borders | Hard box-shadow 4px 4px 0 #000 | Flat colors | Zero border-radius
DO NOT: Soft shadows | Rounded corners | Gradients | Multiple competing colors per screen

## 7. Quick Reference
Canvas: #fffdf2 | Black: #111111 | Yellow: #ffdd00 | Red: #ff4d00 | Blue: #0000ff | Lime: #00cc44
Shadow rule: 4px 4px 0 #111111 | Border rule: 2-3px solid #111111 | Radius: 0px
