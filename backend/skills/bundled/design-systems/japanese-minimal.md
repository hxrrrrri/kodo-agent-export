# Design System: Japanese Minimal (Abstract Theme)

## 1. Visual Theme & Atmosphere

Japanese Minimal draws from wabi-sabi, ma (negative space), and the typographic precision of Japanese print design. Warm paper white (#f7f3ea), dark ink (#20201d), extreme whitespace, and single red accent (#9b2c1f) as a discrete structural element. The design communicates through what is not there as much as what is.

**Key Characteristics:**
- Warm paper white (#f7f3ea) - washi paper reference
- Dark ink (#20201d) - not pure black, the warmth of sumi ink
- Single discrete red accent (#9b2c1f) - used with extreme restraint
- Extreme negative space - sections breathe with 120px+ padding
- Thin rules (1px) as structural elements instead of shadows
- Noto Serif JP or Cormorant Garamond for display, system sans for body

## 2. Color Palette & Roles

**Surface:** Paper #f7f3ea | White #fffdf8 | Card #eeebe1 | Dark #1a1815
**Text:** Ink #20201d | Body #3d3a35 | Muted #706a60 | Light #fffdf8
**Accent:** Red #9b2c1f | Red Muted rgba(155,44,31,0.1)
**Rule:** #d5cfc4 (standard) | #bfb8ab (emphasized)

## 3. Typography

**Display:** Noto Serif JP, Cormorant Garamond, EB Garamond - fallback: Georgia, serif
**Body:** Noto Sans JP, Inter, system-ui, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 72px | 400 | Serif, negative tracking |
| H1 | 48px | 400 | Serif |
| H2 | 32px | 400 | Serif |
| H3 | 22px | 500 | Sans |
| Lead | 20px | 400 | Serif, lead paragraph |
| Body | 17px | 400 | Sans, 1.8 line-height |
| Caption | 13px | 400 | Sans, muted |
| Label | 11px | 500 | Sans, uppercase spaced |

## 4. Component Stylings

**Primary Button:**
- Background: #20201d | Text: #fffdf8 | Border-radius: 0 (sharp) | Padding: 12px 28px
- Font: 14px/500 | Hover: #9b2c1f bg

**Ghost Button:**
- Background: transparent | Border: 1px #20201d | Text: #20201d
- Hover: #20201d bg, #fffdf8 text

**Article Card:**
- No background (transparent, rule at bottom) | 1px #d5cfc4 bottom border
- Category: 11px/500 uppercase #9b2c1f letter-spacing 0.15em
- Title: Noto Serif 24px/400 #20201d | Lead: 16px/400 #3d3a35
- Author: 13px/500 #706a60

**Navigation:**
- Transparent | Height: 80px | Logo (Japanese wordmark or ideograph) left
- Nav items: 14px/500 #3d3a35 letter-spacing 0.06em | Red right-angle accent mark active state
- Extreme horizontal spacing between nav items

**Section Divider:**
- 1px rule + optional red mark at intersection | Not shadows

## 5. Layout
Extreme whitespace: section padding 100-140px | Text max-width: 600px
Asymmetric grid preferred | Single column for longform
Space between elements: deliberate and generous

## 6. Elevation
No shadows at all | Depth from surface contrast only
Thin 1px rules as the sole structural device

## 7. Key Rules
DO: Extreme whitespace | Serif display | Red accent used with extreme restraint (1-2 times per page)
DO NOT: Multiple colors | Rounded corners on buttons | Drop shadows | Illustrations

## 8. Quick Reference
Paper: #f7f3ea | Ink: #20201d | Body: #3d3a35 | Muted: #706a60
Red: #9b2c1f | Rule: #d5cfc4 | Card: #eeebe1 | Dark: #1a1815
Display: Noto Serif JP, Cormorant Garamond | Body: Noto Sans JP, Inter
