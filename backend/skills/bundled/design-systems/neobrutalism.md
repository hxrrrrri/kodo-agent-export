# Design System: Neobrutalism (Abstract Theme)

## 1. Visual Theme & Atmosphere

Neobrutalism is the playful evolution of brutalism. Cream or pastel canvas, chunky offset box-shadows (4px 4px 0 or 6px 6px 0 solid black), thick outlines, saturated fill colors. It feels more dimensional and retro-modern than pure neo-brutal - the shadows create a sticker-like, pressable quality. High contrast but with personality.

**Key Characteristics:**
- Cream (#fef9ef) or light canvas - warm and inviting
- Chunky offset shadows: 4-6px solid black (no blur) - dimensional sticker effect
- Thick borders: 2-3px solid #1a1a1a
- Saturated accent fills: lime, yellow, orange, pink, blue
- Border-radius: 8-12px (slightly rounded, unlike pure brutal)
- Bold typography with some warmth - not all-caps always

## 2. Color Palette & Roles

**Surface:** Cream #fef9ef | White #ffffff | Black text #1a1a1a
**Accent Fills (cards/buttons):**
- Lime #b9ff4b | Yellow #fde84e | Coral #ff6b6b | Blue #4361ee | Lavender #d4a5f5 | Orange #ff8c42
**Text:** Black #1a1a1a | White #ffffff on dark fills
**Border/Shadow:** #1a1a1a (all borders and shadows)

## 3. Typography

**Display:** Clash Display, Space Grotesk, Plus Jakarta Sans, Inter - weight 700-800
**Body:** Inter, system-ui, sans-serif

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 72px | 800 | Slightly rounded, not condensed |
| H1 | 52px | 700 | |
| H2 | 36px | 700 | |
| H3 | 24px | 600 | |
| Body | 16px | 400 | |
| Button | 15px | 700 | |

## 4. Component Stylings

**Primary Button:**
- Lime (#b9ff4b) or yellow (#fde84e) bg | #1a1a1a text
- 2px solid #1a1a1a border | 8px border-radius
- box-shadow: 4px 4px 0 #1a1a1a | Padding: 12px 24px | Font: 15px/700
- Hover: shadow 6px 6px 0 #1a1a1a | Active: transform translate(4px,4px), shadow 0 0 0

**Cards:**
- White or lime (#b9ff4b) bg | 2px solid #1a1a1a border | 8-12px radius
- box-shadow: 4px 4px 0 #1a1a1a | Padding: 20-24px
- Hover: 6px 6px 0 shadow + transform translate(-2px,-2px)

**Navigation:**
- Cream or white bg | 2px solid #1a1a1a bottom | Logo bold left
- Nav links: Inter 15px/600 | CTA: lime button with shadow

**Tags/Badges:**
- Saturated fill (any accent color) | 2px solid #1a1a1a border | 4px radius
- box-shadow: 2px 2px 0 #1a1a1a | 4px 8px padding | 13px/700

## 5. Layout
Max-width: 1200px | Card grid: 3-col | Gap: 20-24px
Section padding: 80px | Asymmetric placement welcome

## 6. Key Rules
DO: Offset solid box-shadow everywhere | Saturated accent fills | 2px solid borders | 8px radius
DO NOT: Blur in shadows | Single neutral palette | Zero radius (that's Neo Brutal, not Neobrutalism)

## 7. Quick Reference
Canvas: #fef9ef | Black: #1a1a1a | Shadow: 4px 4px 0 #1a1a1a | Border: 2px solid #1a1a1a | Radius: 8px
Lime: #b9ff4b | Yellow: #fde84e | Coral: #ff6b6b | Blue: #4361ee | Lavender: #d4a5f5
