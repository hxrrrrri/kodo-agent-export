---
name: web-prototype
description: Single-file HTML prototype using composable section layouts (hero, features, stats, CTA, footer). Design-token-driven with CSS root variables. One accent used at most twice per screen.
---

# Web Prototype

Use this skill to build polished single-file HTML/CSS/JS web prototypes. Output is a responsive, production-quality page delivered as one self-contained file.

## Core Constraint

**One accent color, used at most twice per screen.** The rest is neutrals.

## Composition Approach

Build by assembling pre-defined section archetypes. Each section is a self-contained block:

| Section | Purpose |
|---------|---------|
| `hero` | Above-fold headline, subhead, CTAs, optional product visual |
| `logos` | Trust strip with brand logos or metrics |
| `features` | 3-col or 2-col feature grid with icons and descriptions |
| `how-it-works` | Numbered step sequence with visual support |
| `stats` | Large metric display, 3–4 KPIs |
| `testimonials` | Quote cards with attribution |
| `pricing` | 2–3 tier cards with feature comparison |
| `faq` | Accordion-style Q&A |
| `cta` | Bottom conversion block with primary action |
| `footer` | Links, legal, social |

Choose the right sections for the brief — do not include all of them by default.

## Design Token System

All visual values bound to CSS custom properties:

```css
:root {
  --bg: #ffffff;
  --surface: #f8fafc;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: /* single brand color */;
  --accent-dim: /* 15% opacity accent */;
  --radius: 8px;
  --font-display: /* display typeface */;
  --font-body: /* body typeface */;
}
```

Override these tokens from the active design system. Never hardcode hex values in components.

## Typography Rules

- Display: 56–72px, weight 700–800, tight tracking (-0.02em)
- H2: 36–48px, weight 600–700
- Body: 16–18px, weight 400, line-height 1.6
- Caption/Label: 13–14px, weight 500, tracking 0.01em
- All copy must be real, specific, and purposeful — no lorem ipsum

## Layout Rules

- Max content width: 1140px, centered
- Section padding: 96px top/bottom on desktop, 64px on mobile
- Grid: CSS Grid for features/pricing, Flexbox for hero and nav
- Responsive breakpoints: 768px (tablet), 480px (mobile)
- No horizontal scroll at any breakpoint

## Interaction Rules

- Nav: sticky, with backdrop-blur on scroll
- Buttons: hover state with 8px translateY(-1px) + shadow lift
- Cards: subtle hover elevation (box-shadow transition 200ms ease)
- Accordion/tabs: CSS-only where possible, minimal JS otherwise

## Quality Gates

Before delivery:
1. No default purple/blue gradient heroes
2. No emoji as feature icons — use SVG or Unicode geometric marks
3. No fake metrics (use realistic plausible numbers or leave blank)
4. No lorem ipsum anywhere
5. Responsive: text readable at 375px mobile width
6. One accent maximum, used purposefully
