# Design System: Warmth & Organic (Abstract Theme)

## 1. Visual Theme & Atmosphere

Warmth & Organic is the design language of handcrafted, natural brands. Warm sand (#f5e6d0) canvas with terracotta (#b5541c) and forest green (#2d5016) creating an earthy palette. Natural textures (subtle noise or grain), organic rounded shapes, and serif typography (Lora, Fraunces) communicate authenticity, craft, and connection to the natural world.

**Key Characteristics:**
- Warm sand (#f5e6d0) canvas - the color of natural linen
- Terracotta (#b5541c) as primary warm accent
- Forest green (#2d5016) as secondary nature accent
- Organic shapes: asymmetric blobs, hand-drawn borders, natural curves
- Lora / Fraunces serif for display - humanist and warm
- Subtle grain/noise texture overlay (3-5% opacity)
- No sharp edges: minimum 12px radius, often more organic

## 2. Color Palette & Roles

**Surface:** Sand #f5e6d0 | Cream #fdf8f2 | Off-White #fffff9 | Earth Dark #2a1f14
**Accent 1:** Terracotta #b5541c | Terracotta Light #f2c5a0 | Terracotta Dark #8a3e12
**Accent 2:** Forest Green #2d5016 | Sage #7a9e6a | Mint #c5e8c5
**Neutral Earth:** Warm Gray #8c7b6a | Mid Brown #5a4535 | Deep Earth #2a1f14
**Text:** Ink #2a1f14 | Body #5a4535 | Muted #8c7b6a
**Border:** #d4bfa8 (warm tan) | #c4a888 (emphasized)

## 3. Typography

**Display:** Fraunces, Lora, Playfair Display - weight 400-700 (organic serif)
**Body:** DM Sans, Nunito, Inter - weight 400-500 (humanist sans)

| Role | Size | Weight | Font |
|------|------|--------|------|
| Display | 64px | 700 | Fraunces |
| H1 | 48px | 600 | Fraunces |
| H2 | 32px | 600 | Fraunces |
| H3 | 22px | 500 | DM Sans |
| Body Large | 18px | 400 | DM Sans |
| Body | 16px | 400 | DM Sans, 1.7 line-height |
| Caption | 13px | 400 | DM Sans muted |
| Label | 12px | 600 | DM Sans, spaced |

## 4. Component Stylings

**Primary Button:**
- background: #b5541c | color: #ffffff | border-radius: 999px (pill) | padding: 14px 32px
- font: DM Sans 15px/600 | Hover: #8a3e12 | No shadow

**Ghost Button:**
- transparent | border: 2px solid #b5541c | color: #b5541c | pill radius
- Hover: #b5541c bg, #ffffff text

**Feature Card:**
- background: #fdf8f2 | border: 1px solid #d4bfa8 | border-radius: 20px
- padding: 28px | Optional: organic blob shape as bg decoration
- Category tag: sage green pill | Heading: Fraunces 22px/600 | Body: DM Sans 15px

**Navigation:**
- Cream (#fdf8f2) bg | 1px #d4bfa8 bottom | Height: 64px
- Logo: Fraunces serif wordmark | Links: DM Sans 15px/500 #5a4535 | CTA: terracotta pill button

**Organic Section Divider:**
- Wavy SVG line in #d4bfa8 | Or hand-drawn style divider | Not a straight rule

**Image Treatment:**
- Rounded 20-24px radius | Optional: torn-paper or textured edge overlay
- Warm photo filters (slight warm tone) preferred

## 5. Layout
Max-width: 1100px | Section padding: 80-100px | Generous breathing room
Grid: 3-col cards or alternating 6/6 feature sections | Asymmetric layouts welcome

## 6. Grain Texture
body::after overlay: radial-gradient noise at 3-5% opacity
Or: SVG turbulence filter at low intensity

## 7. Key Rules
DO: Warm sand canvas | Terracotta and forest green | Organic shapes (blobs, waves) | Serif display
DO: Grain texture overlay | Pill buttons | Natural photography with warm tones
DO NOT: Cool grays | Sharp corners | Flat blue accent | Tech-looking layouts

## 8. Quick Reference
Sand: #f5e6d0 | Terracotta: #b5541c | Forest: #2d5016 | Sage: #7a9e6a
Ink: #2a1f14 | Body: #5a4535 | Muted: #8c7b6a | Border: #d4bfa8
Display: Fraunces, Lora | Body: DM Sans, Nunito | Radius: 20px+ organic
