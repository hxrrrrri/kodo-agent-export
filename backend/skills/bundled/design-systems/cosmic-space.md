# Design System: Cosmic Space (Abstract Theme)

## 1. Visual Theme & Atmosphere

Cosmic Space design evokes deep astronomical space. Near-black canvas (#050508) with subtle star field, nebula gradients in violet and deep blue, and constellation-style connecting line patterns. Text floats in cosmic void, accented by celestial highlights. The aesthetic is scientific wonder meets design elegance.

**Key Characteristics:**
- Near-black canvas (#050508) - deep space void
- Star field: tiny white dots at varying opacity (CSS or SVG)
- Nebula accents: violet (#7c3aed) and indigo (#4f46e5) soft gradient orbs
- Stellar white (#f0f4ff) primary text with slight blue tint
- Gold/amber star accents (#fbbf24) for highlight moments
- Constellation: thin connecting lines between feature points

## 2. Color Palette & Roles

**Surface:** Space #050508 | Deep #080b14 | Nebula Card rgba(124,58,237,0.08) | Constellation #0d1225
**Nebula:** Violet #7c3aed | Indigo #4f46e5 | Violet Glow rgba(124,58,237,0.2)
**Stars:** Stellar White #f0f4ff | Star Gold #fbbf24 | Dim Star rgba(255,255,255,0.4)
**Accent:** Cosmic Blue #60a5fa | Aurora Teal #2dd4bf | Pulsar Pink #e879f9
**Text:** Primary #f0f4ff | Secondary #a5b4fc | Muted #6b7280

## 3. Typography

**Display:** Space Grotesk, Sora, Inter - weight 600-700 (clean, modern - lets the cosmic bg shine)
**Body:** Inter, system-ui, sans-serif

| Role | Size | Weight |
|------|------|--------|
| Display | 72px | 700 |
| H1 | 52px | 700 |
| H2 | 36px | 600 |
| H3 | 24px | 600 |
| Body | 16px | 400 |
| Caption | 13px | 400 |

## 4. Component Stylings

**Primary Button:**
- background: linear-gradient(135deg, #7c3aed, #4f46e5)
- border-radius: 10px | padding: 12px 28px | color: #ffffff | font: 15px/600
- box-shadow: 0 4px 20px rgba(124,58,237,0.4)
- Hover: 0 8px 32px rgba(124,58,237,0.5), transform translateY(-2px)

**Cosmic Card:**
- background: rgba(13,18,37,0.8) or rgba(124,58,237,0.08)
- border: 1px solid rgba(124,58,237,0.25) | border-radius: 16px | padding: 24px
- backdrop-filter: blur(8px) | box-shadow: 0 8px 32px rgba(0,0,0,0.5)

**Star Field Background:**
- Small white dots (1-2px) | random placement | varying opacity (0.2 to 0.9)
- Two layers: dim background stars + brighter foreground stars
- CSS: radial-gradient circles OR SVG dot pattern

**Nebula Orb:**
- Large blurred circle (200-400px) | color: rgba(124,58,237,0.3) or rgba(79,70,229,0.2)
- filter: blur(80px) | position: absolute, decorative
- Two orbs per section at opposite corners

**Navigation:**
- background: rgba(5,5,8,0.9) | backdrop-filter: blur(12px)
- border-bottom: 1px solid rgba(124,58,237,0.2) | height: 68px
- Logo: violet gradient text or star icon | Links: #a5b4fc, hover #f0f4ff

**Constellation Lines:**
- SVG paths between feature points | stroke: rgba(124,58,237,0.3) | stroke-width: 1
- Dots at vertices: 3-4px circles | star icon at some vertices

## 5. Layout
Full-width dark canvas | Centered content max-width 1200px
Section padding: 100px | Feature grid: 3-col with constellation connections
Nebula orbs as section dividers (decorative)

## 6. Key Rules
DO: Star field background | Nebula orbs at section corners | Violet/indigo accent gradient
DO: Frosted glass cards over cosmic bg | Constellation connecting lines for features
DO NOT: Warm tones | Light backgrounds | Flat buttons | Decorative without depth

## 7. Quick Reference
Canvas: #050508 | Nebula violet: #7c3aed | Indigo: #4f46e5 | Stellar: #f0f4ff
Glow: 0 4px 20px rgba(124,58,237,0.4) | Card: rgba(13,18,37,0.8) + 1px rgba(124,58,237,0.25) border
