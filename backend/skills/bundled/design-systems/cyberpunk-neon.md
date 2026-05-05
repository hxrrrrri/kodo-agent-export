# Design System: Cyberpunk Neon (Abstract Theme)

## 1. Visual Theme & Atmosphere

Cyberpunk Neon is tech dystopia given a design system. Void black canvas (#070812) with electric cyan (#00f5d4) and hot magenta (#ff0066) as dual neons. Circuit board grid overlays, glitch effects, chrome text, and aggressive condensed typography define the aesthetic. Blade Runner meets product design.

**Key Characteristics:**
- Void black (#070812) primary canvas
- Electric cyan (#00f5d4) and hot magenta (#ff0066) as equal-weight neons
- Circuit-board grid overlay (subtle) on backgrounds
- Glitch effects on hover: chromatic aberration displacement
- Rajdhani/Impact for display, aggressive and condensed
- All glowing: text-shadow, box-shadow neon glow
- Sharp geometry: 0-2px border-radius, harsh edges

## 2. Color Palette & Roles

**Surface:** Void #070812 | Dark Panel #0d111e | Card #111827 | Elevated #1a2035
**Border:** rgba(0,245,212,0.3) (cyan) | rgba(255,0,102,0.3) (magenta) | #2a3050 (neutral)
**Neon Cyan:** #00f5d4 | Cyan Dim rgba(0,245,212,0.15) | Cyan Glow rgba(0,245,212,0.4)
**Neon Magenta:** #ff0066 | Magenta Dim rgba(255,0,102,0.15) | Magenta Glow rgba(255,0,102,0.4)
**Text:** Primary #e0f0ff | Secondary #8090b0 | Muted #4a5572
**Warning:** #f0b232 | Danger: #ff0066 (magenta doubles)

## 3. Typography

**Display:** Rajdhani, Barlow Condensed, Impact - weight 700 (condensed, aggressive)
**Body:** Inter, Rajdhani - weight 400

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 96px | 700 | Condensed ALL-CAPS |
| H1 | 64px | 700 | |
| H2 | 40px | 700 | |
| H3 | 24px | 600 | |
| Body | 15px | 400 | |
| Terminal | 13px | 400 | Monospace green-on-dark |

Text glow (cyan): text-shadow: 0 0 8px #00f5d4, 0 0 16px rgba(0,245,212,0.5)

## 4. Component Stylings

**Primary CTA (Cyan):**
- background: transparent | border: 1px solid #00f5d4 | color: #00f5d4
- border-radius: 2px | padding: 12px 28px | font: Rajdhani 15px/700 UPPERCASE
- box-shadow: 0 0 12px rgba(0,245,212,0.3), inset 0 0 12px rgba(0,245,212,0.05)
- text-shadow: 0 0 8px #00f5d4
- Hover: #00f5d4 bg, #000000 text, glow intensifies

**Secondary CTA (Magenta):**
- Same as above but with #ff0066 throughout

**Neon Card:**
- background: #111827 | border: 1px solid rgba(0,245,212,0.2)
- border-radius: 4px | padding: 20px
- box-shadow: 0 0 20px rgba(0,245,212,0.1)
- Hover: border-color rgba(0,245,212,0.5), shadow 0 0 30px rgba(0,245,212,0.2)

**Circuit Grid Background:**
- SVG grid with horizontal/vertical lines | stroke: rgba(0,245,212,0.05)
- Occasional junction nodes | Faint overlay over canvas

**Navigation:**
- #0d111e bg | border-bottom: 1px solid rgba(0,245,212,0.2) | height: 64px
- Logo: cyan neon glow text | Links: #8090b0, hover #00f5d4 with glow

**Glitch Effect (hover):**
- CSS animation: clip-path cuts + translate offset + red/blue channel split
- 200ms random trigger on hover

## 5. Layout
Full-width dark canvas | Max-width: 1440px | Section padding: 80px
Grid: 3-col cards | Sharp asymmetry welcome | Diagonal cuts possible

## 6. Key Rules
DO: Neon glows on interactive elements | Circuit grid overlay | Dual neon palette (cyan + magenta)
DO: Condensed display type ALL-CAPS | 0-4px border-radius (sharp)
DO NOT: Light backgrounds | Warm colors | Soft shadows | Rounded corners

## 7. Quick Reference
Canvas: #070812 | Panel: #0d111e | Card: #111827
Cyan: #00f5d4 | Magenta: #ff0066 | Primary: #e0f0ff | Muted: #4a5572 | Border neutral: #2a3050
Glow recipe: box-shadow 0 0 12px [color] + 0 0 24px [color-dim]
