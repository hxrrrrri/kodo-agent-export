---
name: magazine-poster
description: Editorial magazine-style print poster with bold type hierarchy, strong visual grid, pull quote, and decisive color accent. Designed for A3/A4 print or high-resolution digital display.
---

# Magazine Poster

Use this skill to produce editorial magazine poster artifacts. Output is a single-page HTML designed for A3/A4 portrait or landscape, or 1080×1350px portrait digital format.

## Canvas Options

| Format | Dimensions | Use Case |
|--------|-----------|---------|
| A3 portrait | 297×420mm (1240×1754px @150dpi) | Print |
| A4 portrait | 210×297mm (874×1240px @150dpi) | Print |
| Digital portrait | 1080×1350px | Instagram post |
| Digital square | 1080×1080px | Social square |

Default to digital portrait (1080×1350px) unless brief specifies print.

## Poster Grid System

Swiss/International typography grid:
- 8-column grid
- Baseline: 8px unit
- Outer margins: 5–8% of width
- Column gutter: 16px

## Type Hierarchy

```
KICKER TEXT (11px, caps, tracked 0.12em, color accent)
─────────────────────────────────────────────────
HEADLINE
3–5 WORDS MAX
(64–96px, weight 800–900, tracking -0.03em)
─────────────────────────────────────────────────
Subheadline or date/issue (18–24px, weight 400)
─────────────────────────────────────────────────
[Visual zone — 40–60% of poster height]
─────────────────────────────────────────────────
Body copy (14–16px, 2–4 lines max, weight 400)
─────────────────────────────────────────────────
Pull quote in large italic (24–32px)
─────────────────────────────────────────────────
Footer: publication name / issue / date
```

## Visual Zone Options

| Option | How to Build |
|--------|-------------|
| Image | Full-bleed `<img>` or placeholder with CSS aspect-ratio |
| Abstract geometric | SVG shapes: circles, rectangles, diagonal rules |
| Type-driven | Oversized single word or number as visual element |
| Data visualization | Bar, pie, or map as editorial visual |
| Color block | Solid color panel with overlaid text |

## Color Discipline

Maximum 3 colors:
1. **Dominant**: background or large surfaces (70–80%)
2. **Secondary**: body text and structural elements (15–25%)
3. **Accent**: one decisive color for emphasis (5–10%)

Accent usage: pull quote bar, kicker text, one key word in headline, or footer rule line.

## Editorial Typography Signatures

For each direction:

**Monocle/FT-style**: Serif display (Georgia, Tiempos), warm sand background, dark brown text, terracotta accent, 1px hairline rules
**Wired-style**: Black background, white display type, single red accent, uppercase kicker with extreme tracking
**NYT-style**: Classic serif, pure white background, black text, section color coding
**Swiss-style**: Helvetica/Arial Black, primary colors, geometric grid, no decoration

## Rules for Headings

- Maximum 5 words in main headline (at poster scale)
- Track headlines at -0.02em to -0.04em (tight is right)
- No mixed-weight headline (pick one weight)
- Avoid centered alignment for headlines over 2 lines

## Quality Gates

1. Headline legible at thumbnail size (200px preview)
2. Exactly one accent color
3. No Lorem ipsum
4. Type hierarchy clearly distinguishable: H1 > H2 > body
5. Print margins (5mm at minimum) preserved
6. Grid alignment: all elements on grid
