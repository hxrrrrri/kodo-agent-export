---
name: craft-color
description: Universal color craft guidelines for design artifacts. Four-layer palette system, accent discipline, contrast standards, dark theme guidance, and naming conventions. Apply to every design output.
---

# Color Craft Guidelines

Apply these rules to every design artifact, regardless of the active design system or visual direction.

## The Four-Layer Palette

| Layer | Allocation | Role |
|-------|-----------|------|
| **Neutrals** | 70–90% | Backgrounds, surfaces, text, borders |
| **Accent** | 5–10% | Primary actions, highlights, key UI elements |
| **Semantic** | 0–5% | Status (success/warning/error/info) |
| **Effects** | <1% | Shadows, overlays, gradients |

**Never let accent exceed 10% of visual real estate.** If it exceeds this, it stops being an accent and becomes a base color.

## Accent Discipline

The most important color rule: **at most 2 visible uses of accent per screen at any time.**

Acceptable accent uses (pick maximum 2 per screen):
- Primary CTA button
- Active navigation item
- Focus ring
- Selected state indicator
- Link color
- Chart primary series

Do not use accent for:
- Section backgrounds
- Card backgrounds
- Illustration fills
- Decorative elements
- Icon fills unless interactive

## Contrast Standards (WCAG 2.1)

| Text Type | Minimum Ratio | Target |
|-----------|--------------|--------|
| Normal text (< 18px) | 4.5:1 | 7:1 |
| Large text (≥ 18px or 14px bold) | 3:1 | 4.5:1 |
| UI components and focus indicators | 3:1 | 4.5:1 |
| Decorative elements | No requirement | — |

Check contrast before delivery. Never assume a color pair works.

Common traps:
- Light gray text (`#9ca3af`) on white fails AA for normal text
- Placeholder text at 30% opacity fails completely
- Blue links on light-blue backgrounds often fail

## Dark Theme Guidance

Do not use pure black and white in dark themes:

| Instead of | Use |
|-----------|-----|
| `#000000` (pure black) | `#0a0a0a` or `#0f0f0f` |
| `#ffffff` (pure white) | `#f5f5f5` or `#f0f0f0` |
| Inverted light-theme palette | Dedicated dark tokens |

Dark theme layer stack (from darkest to lightest):
```css
--bg-base:    #0a0a0a;   /* page background */
--bg-surface: #111111;   /* cards, panels */
--bg-raised:  #1a1a1a;   /* dropdowns, tooltips */
--bg-overlay: #222222;   /* modals, popovers */
```

Elevation in dark themes: use **lighter background layers**, not shadows. Shadows don't register against dark backgrounds.

## Naming Convention

Name by **role and intent**, not by hue:

```css
/* ✓ Role-based */
--color-action-primary: #2563eb;
--color-text-body: #1f2937;
--color-surface-elevated: #f8fafc;
--color-status-success: #16a34a;
--color-border-subtle: #e5e7eb;

/* ✗ Hue-based (avoid) */
--color-blue: #2563eb;
--color-dark-gray: #1f2937;
--color-light-gray: #f8fafc;
```

## OKLch for Derived Colors

When generating additional shades from a base:

```css
/* Create a dim version of accent */
--accent-dim: oklch(from var(--accent) calc(l + 0.2) calc(c * 0.5) h);

/* Create a subtle background tint */
--accent-tint: oklch(from var(--accent) 0.97 0.02 h);
```

OKLch produces perceptually uniform results — shades look equally differentiated across hues.

## Colors That Signal Generic AI Design

Immediately replace these in any output:
- Indigo 500 (`#6366f1`) as default accent — pick something purposeful
- `#3b82f6` (Tailwind blue-500) as default button color
- Gradient `from-purple-500 to-blue-600` for hero backgrounds
- `#8b5cf6` (violet-500) as primary brand color without brand reason
- `rgba(255,255,255,0.1)` glass on dark background as main card style

## Gradient Rules

Two-stop trust gradients are a cardinal sin. If you must use a gradient:
- Use at most 3% of screen real estate
- Angle: 135deg or radial from a corner
- Both stops must be from the same hue family (vary lightness, not hue)
- Never use gradient as the entire hero background on a product page
