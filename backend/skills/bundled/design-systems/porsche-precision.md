# Design System Inspired by Porsche

## 1. Visual Theme & Atmosphere

Porsche's design language is cinema-black precision. Pure black (#0a0a0a) canvas with monumental ALL-CAPS display typography creates a presence that says: this is not ordinary. The design system uses restraint as a luxury signal - vast black expanses, one decisive silver or gold accent, full-bleed car photography that fills entire sections.

**Key Characteristics:**
- Pure black (#0a0a0a) canvas - absolute darkness
- Monumental ALL-CAPS display at 96-120px - dominant and authoritative
- Restrained champagne gold (#c4a97d) or precision silver (#c0c0c0) as sole accent
- Full-bleed vehicle photography as the primary visual content
- Near-zero UI chrome - the car is the design
- Weight 300-400 for display text - featherlight at scale

## 2. Color Palette & Roles

**Surface:** Canvas #0a0a0a | Card #111111 | Elevated #1a1a1a | Section #0d0d0d
**Border:** #2a2a2a (standard) | #3a3a3a (hover)
**Accent:** Champagne Gold #c4a97d | Silver #c8c8c8 | Pure White #ffffff
**Text:** Primary #ffffff | Secondary #a0a0a0 | Muted #6a6a6a
**Brand Red** (#d5001c): Porsche red used only for Porsche logo/wordmark identity

## 3. Typography

**Display:** Porsche Next (custom) fallback: Helvetica Neue, Arial, sans-serif
**Body:** Porsche Next or system sans-serif

| Role | Size | Weight | Letter Spacing | Style |
|------|------|--------|----------------|-------|
| Display Hero | 120px | 300 | 0.05em | ALL-CAPS |
| Display Large | 96px | 300 | 0.04em | ALL-CAPS |
| Display Medium | 64px | 400 | 0.03em | ALL-CAPS |
| Heading | 32px | 400 | 0.02em | ALL-CAPS |
| Sub-heading | 20px | 400 | 0.05em | uppercase |
| Body | 16px | 300 | 0 | sentence case |
| Caption | 13px | 400 | 0.08em | uppercase |

ALL-CAPS with positive tracking is mandatory at display sizes.

## 4. Component Stylings

**Primary CTA:**
- Background: #ffffff | Text: #0a0a0a | Border-radius: 0 (sharp) | Padding: 14px 32px
- Font: 13px/600 uppercase letter-spacing 0.1em | Hover: #c4a97d bg, #0a0a0a text

**Ghost Button:**
- Background: transparent | Border: 1px #ffffff | Text: #ffffff
- Hover: #ffffff bg, #0a0a0a text

**Vehicle Feature Card:**
- Background: #111111 | Border: none | Full-bleed image top | Padding: 20px
- Heading: 20px/400 ALL-CAPS #ffffff | Spec text: 13px #a0a0a0

**Navigation:**
- Background: transparent (overlaid on black hero), becomes rgba(10,10,10,0.95) on scroll
- Height: 72px | Porsche logo (crest) left | Nav links 13px uppercase #ffffff | CTA right
- Links: letter-spacing 0.1em

**Full-Bleed Section:**
- Image fills 100vw x 70vh | Centered text overlay with gradient vignette
- Headline ALL-CAPS at 96px, positioned bottom-left
- Call to action as ghost button

## 5. Layout
Spacing: generous and asymmetric | Section padding: 100-160px top/bottom
Max-width: 1440px | Horizontal padding: 80px desktop, 32px mobile
Grid: often 1-column or 2-column with large visual on one side

## 6. Elevation
No traditional shadows | Depth from pure black to charcoal surface contrast
Photography creates all visual depth | Gold accents create focal points

## 7. Key Rules
DO: Full-bleed photography as primary content | ALL-CAPS display with positive tracking
DO: Weight 300 for large display - featherlight at scale
DO NOT: Warm browns or off-blacks | Rounded corners on buttons (sharp 0px) | Decorative gradients

## 8. Responsive
Mobile: ALL-CAPS scales to 48px | Full-bleed images maintained | Nav collapses cleanly

## 9. Quick Reference
Canvas: #0a0a0a | Card: #111111 | Accent gold: #c4a97d | White: #ffffff
Primary text: #ffffff | Muted: #a0a0a0 | Border: #2a2a2a
Display: ALL-CAPS Helvetica Neue, weight 300, positive letter-spacing
