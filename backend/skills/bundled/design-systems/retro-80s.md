# Design System: Retro 80s (Abstract Theme)

## 1. Visual Theme & Atmosphere

Retro 80s is synthwave nostalgia translated to digital UI. Deep magenta-black canvas (#1a0028) with hot pink (#ff00aa) and electric cyan (#00ffff) neons. VHS aesthetics, scanline textures, chromatic aberration, and pixel-perfect geometric elements. The design transports users to an alternate future as imagined in 1985.

**Key Characteristics:**
- Deep magenta-black canvas (#1a0028 or #0d0015)
- Hot pink (#ff00aa) and electric cyan (#00ffff) dual-neon palette
- Scanline texture overlay (repeating linear-gradient) for CRT effect
- Grid floor: perspective grid in purple/pink fading to horizon
- Neon glow on text and borders (text-shadow and box-shadow glows)
- Courier/VT323 pixel fonts or bold condensed geometric sans

## 2. Color Palette & Roles

**Surface:** Canvas #1a0028 | Dark #0d0015 | Panel rgba(26,0,40,0.85)
**Neon 1:** Hot Pink #ff00aa | Pink Glow rgba(255,0,170,0.3)
**Neon 2:** Electric Cyan #00ffff | Cyan Glow rgba(0,255,255,0.3)
**Neon 3:** Electric Purple #bf00ff | Yellow #ffff00 (accent only)
**Text:** Hot pink (#ff00aa), cyan (#00ffff), or white (#ffffff)
**Grid lines:** rgba(255,0,170,0.4) or rgba(0,255,255,0.4)

## 3. Typography

**Display:** VT323 (pixel font), Orbitron, Impact, or Courier New Bold (retro computing feel)
**Body:** Courier New, monospace | OR Inter for readability-critical sections

| Role | Size | Weight | Effect |
|------|------|--------|--------|
| Hero | 80px | 700 | Hot pink glow text-shadow |
| H1 | 56px | 700 | Cyan glow |
| H2 | 36px | 700 | No glow or subtle |
| Body | 16px | 400 | Courier or Inter |
| VHS Label | 14px | 700 | ALL-CAPS, monospace |

Text glow recipe: text-shadow: 0 0 10px #ff00aa, 0 0 20px #ff00aa, 0 0 40px #ff00aa

## 4. Component Stylings

**Primary Button:**
- Transparent bg | 2px solid #ff00aa border | color #ff00aa
- text-shadow: 0 0 8px #ff00aa | box-shadow: 0 0 10px rgba(255,0,170,0.4), inset 0 0 10px rgba(255,0,170,0.1)
- border-radius: 0 (sharp) | padding: 12px 28px | font: Orbitron/Impact 14px UPPERCASE
- Hover: #ff00aa bg, #000000 text, glow intensifies

**Neon Card:**
- background: rgba(13,0,21,0.85) | border: 1px solid rgba(0,255,255,0.5)
- box-shadow: 0 0 20px rgba(0,255,255,0.2), inset 0 0 20px rgba(0,255,255,0.05)
- border-radius: 4px | Scanline overlay: repeating-linear-gradient(transparent 0, transparent 1px, rgba(0,0,0,0.15) 1px, rgba(0,0,0,0.15) 2px)

**Scanline Texture:**
- Overlay element on top of content
- background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)
- pointer-events: none

**Perspective Grid:**
- SVG or CSS perspective grid at hero section bottom
- Lines in hot pink or cyan fading to vanishing point

**Navigation:**
- Transparent or dark bg | Neon logo with glow | Links in cyan or pink
- 2px neon bottom border

## 5. Layout
Full dark canvas | Centered content max-width 1100px
Heavy use of negative space (dark void) | Neon elements as focal points

## 6. Key Rules
DO: Neon glows on all interactive elements | Scanline texture | Perspective grid | CRT aesthetic
DO NOT: Warm tones | Light backgrounds | Soft shadows | Decorative pastels

## 7. Quick Reference
Canvas: #1a0028 | Hot Pink: #ff00aa | Cyan: #00ffff | Purple: #bf00ff
Glow recipe: text-shadow 0 0 10px + 0 0 20px + 0 0 40px (same color)
Display: VT323, Orbitron, Courier New | Radius: 0-4px sharp
