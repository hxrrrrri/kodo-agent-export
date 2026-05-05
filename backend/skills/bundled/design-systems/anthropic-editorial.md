# Design System Inspired by Anthropic

## 1. Visual Theme & Atmosphere

Anthropic brand site uses warm parchment canvas (#f3efe7). Where competitors use cool tech-neutral whites, Anthropic uses paper-warmth, evoking scholarly publications. The terracotta accent (#d97757) on CTAs and brand mark is warm, muted, intentionally un-tech.

A serif display face (Tiempos Headline / Cormorant Garamond fallback) at weight 400 with negative tracking handles all headlines. Body uses humanist sans (StyreneB / Inter) at 18px for editorial reading comfort.

**Key Characteristics:**
- Warm parchment canvas (#f3efe7) - the defining brand choice
- Terracotta accent (#d97757) on CTAs and brand mark exclusively
- Serif display (Tiempos/Garamond) + humanist sans (Inter)
- Deep ink text (#191714) - warm dark, not pure black
- 80-96px section padding - academic pacing
- No illustrations - text and surface contrast carry the design

## 2. Color Palette & Roles

### Brand
- **Terracotta** (#d97757): Primary CTA, brand mark
- **Terracotta Dark** (#b85e3e): Hover state

### Surface
- **Parchment** (#f3efe7): Root background
- **Warm White** (#fbfaf7): Section highlights
- **Cream Card** (#ece6db): Feature cards
- **Dark Ink** (#191714): Footer, dark bands

### Text
- **Ink** (#191714): All headlines
- **Body** (#4a4640): Default text
- **Muted** (#7a7268): Captions, metadata
- **Hairline** (#d9d2c5): 1px borders

## 3. Typography Rules

### Font Family
- Display: Tiempos Headline - fallback: Cormorant Garamond, EB Garamond, Georgia, serif
- Body: StyreneB - fallback: Inter, -apple-system, sans-serif
- Code: JetBrains Mono, Menlo, monospace

### Hierarchy

| Role | Size | Weight | Letter Spacing | Font |
|------|------|--------|----------------|------|
| Display XL | 72px | 400 | -0.03em | Tiempos |
| Display L | 52px | 400 | -0.02em | Tiempos |
| Display M | 40px | 400 | -0.015em | Tiempos |
| Display S | 28px | 400 | -0.01em | Tiempos |
| Title | 20px | 500 | 0 | StyreneB |
| Body Large | 18px | 400 | 0 | StyreneB |
| Body | 16px | 400 | 0 | StyreneB |
| Caption | 14px | 400 | 0 | StyreneB |
| Label | 12px | 500 | 0.08em | StyreneB uppercase |
| Button | 15px | 500 | 0 | StyreneB |

### Principles
Serif display at weight 400 ONLY - never bold. Negative tracking required on all display sizes. Serif in display, sans in body - the split is the brand signature.

## 4. Component Stylings

### Buttons
- Primary: #d97757 bg, #ffffff text, 6px radius, 12px 24px padding, hover #b85e3e
- Secondary: transparent bg, 1px #d9d2c5 border, #191714 text, hover bg #ece6db

### Cards
- Background: #ece6db | Border: 1px #d9d2c5 | Radius: 10px | Padding: 28px
- Heading: Tiempos 24px/400 #191714 | Body: StyreneB 16px/400 #4a4640

### Navigation
- rgba(243,239,231,0.92) + backdrop-blur(10px) | Height: 64px
- Terracotta A-mark + wordmark left | 15px/500 #4a4640 links | Terracotta CTA right

### Tags
- #ece6db bg | #4a4640 text | 999px radius | 4px 12px padding
- Active: #d97757 bg, #ffffff text

### Research Paper Cards
- White/warm-white bg with #d9d2c5 hairline border
- Serif display heading | Category badge: 12px uppercase #d97757 on #f2c4a8

## 5. Layout Principles

### Spacing (base 8px)
| Token | Value | Use |
|-------|-------|-----|
| md | 16px | Card internal |
| lg | 24px | Card padding |
| xl | 32px | Section sub |
| 2xl | 48px | Section break |
| 3xl | 80px | Section gap |
| 4xl | 96px | Hero padding |

### Grid
- Max-width: 1200px | Hero: Tiempos headline, single centered column
- Feature: 6/6 split alternating | Research: 3-up | Padding: 64px desktop, 20px mobile

## 6. Depth & Elevation
| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No border | Body sections |
| Hairline | 1px #d9d2c5 | Cards, inputs |
| Cream Card | #ece6db background | Feature cards |
| Dark Band | #191714 background | Footer, CTAs |
| Focus | 0 0 0 3px rgba(217,119,87,0.25) | Keyboard focus |

## 7. Do's and Don'ts
### Do
- Parchment canvas always - warmth is the brand
- Serif display 400 with negative tracking for all headlines
- Reserve terracotta for primary CTA only
- Alternate parchment > cream > dark for page pacing
- 80px section padding minimum

### Don't
- Don't use pure white or cool gray canvas
- Don't bold the serif (400 only)
- Don't add gradients or decorative elements
- Don't use terracotta on more than one CTA per viewport

## 8. Responsive Behavior
| Name | Width | Changes |
|------|-------|---------|
| Mobile | <768px | Serif 72->36px, hamburger nav, 20px padding |
| Tablet | 768-1024px | 2-col grids, serif 52px |
| Desktop | >1024px | Full layout, serif 72px |

## 9. Agent Prompt Guide
### Quick Colors
- Canvas: #f3efe7 | Ink: #191714 | Body: #4a4640 | Muted: #7a7268
- Terracotta: #d97757 | Card: #ece6db | Hairline: #d9d2c5 | Dark: #191714

### Example Prompts
- Hero on parchment #f3efe7: 72px/400 Tiempos -0.03em tracking in #191714, 18px/400 #4a4640 sub, terracotta CTA
- Feature card: #ece6db bg, 1px #d9d2c5 border, 10px radius, Tiempos 24px heading, StyreneB 16px body
- Sticky nav: rgba(243,239,231,0.92) blur, 64px height, terracotta A-mark left, 15px/500 links, terracotta CTA right
