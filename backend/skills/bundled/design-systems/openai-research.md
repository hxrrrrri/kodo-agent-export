# Design System Inspired by OpenAI

## 1. Visual Theme & Atmosphere

OpenAI's design language is high-modernist restraint at scale. Pure white canvas (`#ffffff`) with jet-black (`#0a0a0a`) authority creates maximum contrast without warmth — deliberate counter-positioning against editorial and startup aesthetics. The system communicates scientific confidence through what it removes rather than what it adds. No decorative gradients, no brand-color fills on large surfaces. Instead, OpenAI invests everything in typographic scale: hero headlines at 72–96px feel monumental and inevitable, as if the ideas themselves demand this much space.

The green (`#10a37f`) is the sole accent — used sparingly on CTAs, logo mark, and interactive states. It appears perhaps twice per screen, never more. Cool grays (`#d9d9e3`, `#acacbe`, `#8e8ea0`) handle the entire text hierarchy from secondary headings down to footnotes. The result reads like a research paper elevated to product design — rigorous, confident, and deliberately not trying to sell you anything.

**Key Characteristics:**
- Pure white canvas (`#ffffff`) — zero tonal warmth, maximum legibility
- Jet-black (`#0a0a0a`) primary text and buttons — not pure black, slight warmth
- OpenAI Green (`#10a37f`) as the only accent — CTAs, logo, active states only
- Söhne (or Inter) at extreme display scales — weight 600-700 at 72-96px
- Extreme type scale: 96px display vs 16px body — almost no mid-sizes
- Cards with 1px `#e5e5e5` border, `border-radius: 12px`, no shadows at rest

## 2. Color Palette & Roles

### Primary
- **Jet Black** (`#0a0a0a`): All primary CTAs, headings, primary UI elements
- **Pure White** (`#ffffff`): Page canvas, card surfaces, input backgrounds

### Accent
- **OpenAI Green** (`#10a37f`): Primary CTA background, logo mark, active states, focus rings
- **Green Hover** (`#0d8f6e`): Darker green on hover

### Text Hierarchy
- **Ink** (`#0a0a0a`): Display headings, nav brand, primary labels
- **Secondary** (`#353740`): Body text, feature descriptions
- **Muted** (`#8e8ea0`): Metadata, timestamps, captions
- **Subtle** (`#acacbe`): Placeholder text, disabled labels
- **Hairline** (`#d9d9e3`): Borders, dividers

### Surface
- **Canvas** (`#ffffff`): Root background
- **Surface** (`#f7f7f8`): Alternate section backgrounds, input fills
- **Dark** (`#202123`): Footer, dark panels, code blocks
- **Dark Surface** (`#343541`): Dark mode card surfaces

## 3. Typography Rules

### Font Family
**All text:** Söhne — fallback: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
**Code:** `SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Display Hero | 96px | 700 | 0.95 | -0.03em | Main homepage headline |
| Display Large | 72px | 700 | 1.0 | -0.02em | Section headlines |
| Display Medium | 52px | 600 | 1.05 | -0.015em | Sub-section titles |
| Heading 1 | 40px | 600 | 1.1 | -0.01em | Major page sections |
| Heading 2 | 28px | 600 | 1.2 | 0 | Card titles |
| Body Large | 18px | 400 | 1.6 | 0 | Lead paragraphs |
| Body | 16px | 400 | 1.65 | 0 | Default body |
| Body Small | 14px | 400 | 1.55 | 0 | Captions, metadata |
| Label | 13px | 500 | 1.4 | 0.02em | Tags, badges |
| Code | 14px | 400 | 1.6 | 0 | Code blocks |
| Button | 15px | 500 | 1.0 | 0 | CTA labels |

### Principles
No decorative weight variation. 700 for display headings, 400 for everything else. Negative letter-spacing at large sizes is structural. The type system communicates through scale contrast alone — adjacent sizes should differ by at least 12px.

## 4. Component Stylings

### Buttons

**Primary (Black Fill)**
- Background: `#0a0a0a` | Text: `#ffffff`
- Border-radius: 6px | Padding: 12px 24px | Height: 44px
- Hover: `#1a1a1a` | Focus: 2px `#10a37f` outline offset 2px

**Primary (Green Fill)**
- Background: `#10a37f` | Text: `#ffffff` | Same geometry
- Hover: `#0d8f6e`

**Secondary (Outline)**
- Background: transparent | Border: 1px solid `#d9d9e3`
- Text: `#0a0a0a` | Hover: border-color `#acacbe`, background `#f7f7f8`

### Cards & Containers
- Background: `#ffffff` | Border: 1px solid `#e5e5e5`
- Border-radius: 12px | Padding: 24px
- Hover: `0 4px 16px rgba(0,0,0,0.06)` + `transform: translateY(-2px)`

### Navigation
- Background: `rgba(255,255,255,0.9)` + `backdrop-filter: blur(12px)` — sticky
- Height: 64px | Logo + wordmark left, nav links center, CTA right
- Nav links: 14px/500, `#353740`, hover → `#0a0a0a`

### Inputs
- Background: `#ffffff` | Border: 1px solid `#d9d9e3`
- Border-radius: 6px | Padding: 10px 14px | Height: 44px
- Focus: border-color `#10a37f`, 3px `rgba(16,163,127,0.15)` ring

## 5. Layout Principles

### Spacing System (base 8px)
| Token | Value | Use |
|-------|-------|-----|
| xs | 4px | Tight inline |
| sm | 8px | Icon gaps |
| md | 16px | Default padding |
| lg | 24px | Card padding |
| xl | 32px | Section sub |
| 2xl | 48px | Section break |
| 3xl | 64px | Major section |
| 4xl | 96px | Hero padding |
| 5xl | 128px | Between major sections |

### Grid & Container
- Max-width: 1200px | Hero copy max-width: 760px centered
- Feature grid: 3-up desktop, 2-up tablet, 1-up mobile
- Section padding: 80px desktop, 48px mobile

### Whitespace Philosophy
OpenAI treats whitespace as primary content. Between major sections: 80–128px. The generous macro-spacing positions the brand as thoughtful and unhurried. Every section is a standalone composition.

### Border Radius Scale
| Value | Context |
|-------|---------|
| 4px | Small tags |
| 6px | Buttons, inputs |
| 12px | Cards, panels |
| 16px | Large image containers |
| 999px | Pill badges |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow, white | Default sections |
| Card Rest | 1px `#e5e5e5` border | Content cards |
| Card Hover | `0 4px 16px rgba(0,0,0,0.06)` | Hover state |
| Modal | `0 8px 40px rgba(0,0,0,0.12)` | Dialogs |
| Focus | `0 0 0 3px rgba(16,163,127,0.25)` | Keyboard focus |

## 7. Do's and Don'ts

### Do
- Use pure white canvas with maximum contrast black text
- Reserve green for exactly one CTA per viewport
- Use extreme type scale (96px vs 16px) — the contrast is the design
- Apply 1px `#e5e5e5` borders on cards — no shadows at rest
- Keep cool gray hierarchy: `#353740` body, `#8e8ea0` muted

### Don't
- Don't add decorative gradients or colored section backgrounds
- Don't use green on more than 1–2 elements per screen
- Don't round buttons more than 6px
- Don't mix font weights randomly — 700 for structure only

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Changes |
|------|-------|---------|
| Mobile | <640px | Nav collapses, 96px→48px display, 24px padding |
| Tablet | 640–1024px | 2-col grids, 64px display |
| Desktop | 1024–1440px | Full layout, 3-up grids |
| Wide | >1440px | Max-width container centers |

## 9. Agent Prompt Guide

### Quick Color Reference
- Canvas: `#ffffff` | Primary text: `#0a0a0a` | Body: `#353740`
- Muted: `#8e8ea0` | Accent: `#10a37f` | Border: `#e5e5e5`
- Alt surface: `#f7f7f8` | Dark: `#202123`

### Example Component Prompts
- "Hero on white: 96px/700 Söhne/Inter in `#0a0a0a` with `-0.03em` tracking, 18px/400 `#353740` sub, black and green buttons"
- "Feature card: white bg, 1px `#e5e5e5` border, 12px radius, 24px padding, 20px/600 `#0a0a0a` heading, 16px/400 `#353740` body"
- "Sticky nav: 64px, `rgba(255,255,255,0.9)` blur, logo left, 14px/500 `#353740` links, `#0a0a0a` CTA button right"
