# Design System Inspired by Mercedes-Benz

## 1. Visual Theme & Atmosphere

Mercedes-Benz design communicates automotive luxury through restraint. Near-black canvas (#0a0a0a) with sterling silver heritage accents (#c8c8c8) and pristine white typography. The three-pointed star is the sole decorative element - everything else steps back for full-bleed vehicle photography.

**Key Characteristics:**
- Near-black canvas (#1a1a1a) or pure black (#0a0a0a) primary background
- Silver heritage accent (#c8c8c8) - the star, active states, key CTAs
- Ultra-thin typography (weight 300-400) at large scale
- Full-bleed vehicle photography with minimal overlay text
- Extreme whitespace between elements
- Serif touches (optional) for model names in editorial sections

## 2. Color Palette & Roles

**Surface:** Canvas #1a1a1a | Deep Black #0a0a0a | Card #242424 | Section #111111
**Border:** #333333 (subtle) | #444444 (hover)
**Accent:** Sterling Silver #c8c8c8 | Bright Silver #e8e8e8 | Pure White #ffffff
**Text:** Primary #ffffff | Secondary #b4b4b4 | Muted #787878
**Brand Blue** (#0a4dab): Mercedes EQ electric accent (use sparingly)

## 3. Typography

**Display:** MB Corp (custom) fallback: Helvetica Neue, Arial, sans-serif
**Body:** System sans-serif

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Display Hero | 96px | 300 | -0.01em |
| Display Large | 64px | 300 | 0 |
| Display Medium | 44px | 400 | 0.01em |
| Heading | 28px | 400 | 0.02em |
| Model Name | 24px | 300 | 0.08em |
| Body | 16px | 300 | 0.01em |
| Caption | 13px | 400 | 0.06em |

## 4. Component Stylings

**Primary CTA:**
- Background: #ffffff | Text: #0a0a0a | Border-radius: 0 | Padding: 14px 32px
- Font: 13px/500 letter-spacing 0.08em uppercase | Hover: #c8c8c8 bg

**Ghost Button:**
- Background: transparent | Border: 1px #c8c8c8 | Text: #c8c8c8
- Hover: #c8c8c8 bg, #0a0a0a text

**Model Spec Card:**
- Background: #242424 | Border: none | Border-radius: 0
- Model name: 20px/300 #ffffff uppercase letter-spacing 0.06em
- Spec grid: 2-col, label 12px #787878 uppercase, value 16px/300 #c8c8c8
- Separator: 1px #333333

**Navigation:**
- Transparent on hero, rgba(10,10,10,0.97) on scroll | Height: 68px
- Three-pointed star logo center or left | Nav links: 13px #b4b4b4 letter-spacing 0.08em uppercase
- Hover: #ffffff

## 5. Layout
Section padding: 100-120px | Horizontal padding: 80px desktop, 24px mobile
Max-width: 1440px | Grid: mostly single-column or 2-col with large photography

## 6. Elevation
Depth from contrast only: black > dark gray | No traditional shadows
Silver details create focal points against darkness

## 7. Key Rules
DO: Full-bleed vehicle photography | Weight 300 for display | Silver as the precious accent
DO NOT: Warm tones | Rounded corners on main CTAs | Decorative gradients | Bold display type

## 8. Quick Reference
Canvas: #1a1a1a | Deep: #0a0a0a | Card: #242424 | Silver: #c8c8c8 | White: #ffffff
Primary: #ffffff | Secondary: #b4b4b4 | Muted: #787878 | Border: #333333
