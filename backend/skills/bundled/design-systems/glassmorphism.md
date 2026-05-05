# Design System: Glassmorphism (Abstract Theme)

## 1. Visual Theme & Atmosphere

Glassmorphism creates UI elements that appear to be made of frosted glass floating over vivid gradient backgrounds. The effect requires: semi-transparent backgrounds (rgba), backdrop-filter blur, subtle white borders, and layered depth. The background gradient provides all the color energy; the glass elements sit neutrally above it.

**Key Characteristics:**
- Rich gradient background: deep purple-blue-dark (#1a0533 to #0d1b4b to #001030)
- Glass panels: rgba(255,255,255,0.12) background + backdrop-filter blur(20px)
- White/light borders: 1px solid rgba(255,255,255,0.2)
- Layered floating cards with increasing blur depth
- Accent glow: violet (#8b5cf6) or cyan (#06b6d4) as soft glows
- White/near-white text on glass surfaces

## 2. Color Palette & Roles

**Background Gradient:** #1a0533 > #0d1b4b > #001030 (deep purple to dark navy)
**Glass Surfaces:**
- Primary glass: rgba(255,255,255,0.12), blur(20px)
- Secondary glass: rgba(255,255,255,0.08), blur(12px)
- Elevated glass: rgba(255,255,255,0.18), blur(24px)
**Glass Borders:** rgba(255,255,255,0.2) | rgba(255,255,255,0.3) (emphasized)
**Text:** #ffffff (primary) | rgba(255,255,255,0.7) (secondary) | rgba(255,255,255,0.5) (muted)
**Accent:** Violet #8b5cf6 | Cyan #06b6d4 | Pink #ec4899
**Glow:** 0 0 40px rgba(139,92,246,0.3) (violet glow) | 0 0 30px rgba(6,182,212,0.3)

## 3. Typography

**All:** Inter, -apple-system, sans-serif (clean, legible against glass)

| Role | Size | Weight |
|------|------|--------|
| Display | 64px | 700 |
| H1 | 48px | 700 |
| H2 | 32px | 600 |
| H3 | 22px | 600 |
| Body | 16px | 400 |
| Caption | 13px | 400 |

## 4. Component Stylings

**Glass Card:**
- background: rgba(255,255,255,0.12) | backdrop-filter: blur(20px) | -webkit-backdrop-filter: blur(20px)
- border: 1px solid rgba(255,255,255,0.2) | border-radius: 16px | padding: 24px
- box-shadow: 0 8px 32px rgba(0,0,0,0.3)

**Glass Button:**
- background: rgba(255,255,255,0.15) | border: 1px solid rgba(255,255,255,0.25)
- border-radius: 12px | padding: 12px 24px | color: #ffffff | font: 15px/600
- Hover: rgba(255,255,255,0.22) | Glow: 0 0 20px rgba(139,92,246,0.4)

**Primary CTA (Gradient):**
- background: linear-gradient(135deg, #8b5cf6, #06b6d4)
- border-radius: 12px | padding: 12px 28px | font: 15px/700
- box-shadow: 0 4px 20px rgba(139,92,246,0.4)

**Glass Navigation:**
- background: rgba(255,255,255,0.08) | backdrop-filter: blur(16px)
- border-bottom: 1px solid rgba(255,255,255,0.1) | height: 64px
- Logo: white | Links: rgba(255,255,255,0.8), hover #ffffff

**Background:**
- Full-page gradient: linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #001030 100%)
- Decorative orbs: large colored circles with blur (filter: blur(80px)) behind cards

## 5. Layout
Max-width: 1200px | Floating cards with z-index layers
Section padding: 80px | Card grid: 3-col with 24px gap

## 6. Key Rules
DO: backdrop-filter blur on all glass elements | rgba white borders | Rich gradient background
DO NOT: Solid white backgrounds | No blur (kills the effect) | Dark borders | Flat colors for glass

## 7. Quick Reference
Glass card: rgba(255,255,255,0.12) + blur(20px) + 1px rgba(255,255,255,0.2) border + 16px radius
Background: linear-gradient(135deg, #1a0533, #0d1b4b, #001030)
Glow: 0 0 40px rgba(139,92,246,0.3) | Accent: #8b5cf6 violet | #06b6d4 cyan
