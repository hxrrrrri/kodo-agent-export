# Design System: Claymorphism (Abstract Theme)

## 1. Visual Theme & Atmosphere

Claymorphism creates UI elements that look like inflated, 3D clay objects. The effect combines: soft pastel backgrounds, inner highlights (top-left white glow), outer soft shadows, and exaggerated border-radius (24-32px). Everything looks like it has thickness and can be pressed. Playful, toy-like, delightful.

**Key Characteristics:**
- Soft pastel backgrounds: lavender (#f3e8ff), peach (#fff0e6), mint (#e0faf4), sky (#e0f2fe)
- Exaggerated border-radius: 24-32px - everything is pillowy
- Inner top-left highlight: inset 2px 2px 0 rgba(255,255,255,0.7)
- Outer soft shadow: 0 8px 24px rgba(X,X,X,0.2) in the element's own color
- Saturated fill colors per clay element
- Nunito / Poppins rounded font - approachable personality

## 2. Color Palette & Roles

**Background:** Soft pastel (#f8f5ff lavender or #fff5f0 peach)
**Clay Elements (each has its own pastel fill):**
- Lavender clay: #c4b5fd fill, inner highlight, violet shadow
- Peach clay: #fdba74 fill, inner highlight, orange shadow
- Mint clay: #6ee7b7 fill, inner highlight, emerald shadow
- Sky clay: #93c5fd fill, inner highlight, blue shadow
- Pink clay: #f9a8d4 fill, inner highlight, pink shadow
**Text:** Deep matching color per element | General: #374151
**Shadow colors:** Match the clay fill at 0.2-0.3 opacity

## 3. Typography

**All:** Nunito, Poppins, Quicksand, -apple-system, sans-serif (rounded letters preferred)

| Role | Size | Weight |
|------|------|--------|
| Display | 56px | 800 |
| H1 | 40px | 700 |
| H2 | 28px | 700 |
| H3 | 20px | 600 |
| Body | 16px | 400 |
| Button | 16px | 700 |

## 4. Component Stylings

**Clay Card:**
- Background: #c4b5fd (or other pastel fill) | border-radius: 28px | padding: 24px
- box-shadow: 0 12px 24px rgba(139,92,246,0.25), inset 2px 2px 0 rgba(255,255,255,0.6)
- No border | Hover: transform scale(1.02), shadow 0 16px 32px rgba(139,92,246,0.3)

**Clay Button:**
- Saturated pastel bg | border-radius: 999px (pill shape for most)
- padding: 14px 32px | font: 16px/700 | color: deep variant of fill color
- box-shadow: 0 6px 16px rgba(fill-color,0.35), inset 1px 1px 0 rgba(255,255,255,0.6)
- Hover: transform translateY(-3px), shadow grows | Active: transform translateY(2px)

**Clay Navigation:**
- #f8f5ff soft bg | Logo with clay-style rounded letters | Nav links: rounded pill hover states
- CTA: clay button with matching fill

**Clay Input:**
- White or very light bg | border-radius: 16px | padding: 14px 20px
- box-shadow: inset 2px 2px 6px rgba(0,0,0,0.06), inset -1px -1px 4px rgba(255,255,255,0.8)
- Focus: 3px solid pastel accent outline

**Clay Icon:**
- Colored circle (28-40px) | icon white inside | match clay color
- box-shadow: inset 1px 1px 0 rgba(255,255,255,0.5), 0 4px 8px rgba(fill,0.3)

## 5. Layout
Max-width: 1100px | Soft, rounded grid | 24-32px gaps between elements
Everything feels spacious and airy | Padding: 64-80px sections

## 6. Key Rules
DO: Inner highlight on all clay elements (inset white glow) | Exaggerated radius 24-32px
DO: Saturated pastel fills | Outer soft colored shadow | Rounded font (Nunito/Poppins)
DO NOT: Sharp corners | Hard shadows | Dark backgrounds | Muted colors

## 7. Quick Reference
Clay card recipe: [pastel-fill] bg + 28px radius + 0 12px 24px [fill-at-0.25] shadow + inset 2px 2px 0 rgba(255,255,255,0.6)
Backgrounds: #f8f5ff (lavender) | #fff5f0 (peach) | #f0fdfb (mint)
Font: Nunito, Poppins | Weight: 700-800 for display
