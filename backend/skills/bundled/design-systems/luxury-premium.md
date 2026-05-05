# Design System: Luxury Premium (Abstract Theme)

## 1. Visual Theme & Atmosphere

Luxury Premium is the design language of high-end fashion, jewelry, and prestige brands. Near-black (#0b0a08) canvas with warm gold (#c8a45d) as the only precious accent. Ultra-thin serif typography (Cormorant Garamond, Didot) at generous sizes. Extreme whitespace. Monochromatic restraint - the absence of color IS the luxury signal.

**Key Characteristics:**
- Near-black (#0b0a08) or warm off-white (#faf7f2) canvas - pick one per design
- Warm gold (#c8a45d) as sole accent - used sparingly like real gold
- Ultra-thin serif display (Cormorant Garamond weight 300-400 at 80-120px)
- Extreme whitespace - more space than content
- No decoration - zero gradients, zero patterns, zero illustrations
- Photography: high-end editorial or product photography only

## 2. Color Palette & Roles

**Dark Mode Surface:** Canvas #0b0a08 | Surface #141210 | Card #1e1b17 | Border #2e2b25
**Light Mode Surface:** Canvas #faf7f2 | Surface #f5f0e8 | Card #ffffff | Border #e8e0d0
**Precious:** Gold #c8a45d | Gold Light #e8d5a8 | Gold Dark #9a7a3f
**Text (Dark):** Primary #f5f0e8 | Muted #9a9080
**Text (Light):** Primary #1a1510 | Muted #7a6e60
**No semantic colors** - luxury brands do not use red/green status indicators

## 3. Typography

**Display:** Cormorant Garamond, Bodoni Moda, Didot - fallback: Georgia, Times New Roman, serif
**Body:** Cormorant or Helvetica Neue Light, system-ui - weight 300-400

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Hero Display | 120px | 300 | 0.1em (wide tracking) |
| Headline | 72px | 300 | 0.08em |
| Sub-headline | 44px | 400 | 0.06em |
| Title | 28px | 400 | 0.04em |
| Body | 16px | 300 | 0.02em |
| Caption | 12px | 400 | 0.12em uppercase |
| Label | 11px | 500 | 0.15em uppercase |

## 4. Component Stylings

**Primary CTA:**
- Transparent bg | 1px solid (gold #c8a45d) border
- color: #c8a45d | font: 11px/500 uppercase, 0.15em tracking
- padding: 16px 48px | No border-radius (0px sharp) | Hover: gold bg, dark text

**Ghost Button (Dark canvas):**
- 1px solid rgba(245,240,232,0.3) | color: #f5f0e8
- Same geometry | Hover: rgba(245,240,232,0.08) bg

**Product Card:**
- No border, no shadow | Just image + text below
- Image: full-width, 3:4 portrait | No frame
- Brand: 11px/500 uppercase letter-spacing 0.1em muted
- Product name: serif 22px/400 | Price: serif 18px/300

**Navigation:**
- Transparent or very dark/light | Zero border | 80px height
- Logo: serif wordmark centered or left | Links: 11px/500 uppercase spaced | Very minimal

**Section Divider:**
- Single 1px horizontal rule | 1px solid rgba(200,164,93,0.3) or rgba(255,255,255,0.1)
- Sometimes replaced by large whitespace alone

## 5. Layout
Extreme whitespace: section padding 120-200px | Max-width: 1200px
Single column preferred | Grid: 2-col max | Let breathing room dominate

## 6. Key Rules
DO: Extreme whitespace | Serif at weight 300 with wide tracking | Gold accent once or twice per page
DO NOT: Multiple colors | Rounded anything | Decorative elements | Large body font weights | Crowded layouts

## 7. Quick Reference
Canvas dark: #0b0a08 | Canvas light: #faf7f2 | Gold: #c8a45d | Border: #2e2b25 (dark) / #e8e0d0 (light)
Primary dark: #f5f0e8 | Primary light: #1a1510 | Muted: #9a9080
Display: Cormorant Garamond 300, wide tracking | Radius: 0px (sharp)
