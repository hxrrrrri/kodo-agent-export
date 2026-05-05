---
name: wireframe-sketch
description: Hand-drawn whiteboard wireframe aesthetic with graph-paper grid, marker tones, hatched fills, dashed borders, and sketch-style typography. Intentionally loose — never pixel-perfect.
---

# Wireframe Sketch

Use this skill to produce hand-drawn whiteboard wireframe artifacts. The output must look sketched, not polished. Looseness and imprecision are intentional design signals, not bugs.

## Visual System

- Background: graph-paper grid, 24px spacing, `#e8e8e8` lines on `#fafafa`
- All borders: dashed or hand-drawn SVG strokes, not solid CSS borders
- Fills: hatched diagonal patterns (CSS `repeating-linear-gradient` at 45°), never solid colors
- Shadows: slight paper-texture offset only, no CSS box-shadow polish
- Corner radius: 0px or 2px max — no rounded cards

## Typography

Load via Google Fonts:
- Display/Headlines: `Caveat` (handwritten)
- Body/Labels: `Patrick Hand` (casual legible)
- Annotations: `Architects Daughter` (sketch note style)

All text should feel hand-annotated. Use `letter-spacing: 0.01em` on body.

## Layout Conventions

- Elements: floating with visible imprecision (1–3px random offset)
- Placeholder images: crosshatch box with aspect-ratio label inside
- Icons: hand-drawn SVG circles, triangles, rough shapes only
- Buttons: dashed border, flat white fill, label in Caveat
- Navigation: horizontal bar with underline-active state
- Cards: dashed-border boxes with hatched header strip

## Annotation System

- Sticky notes: `#fffab2` background, slight rotation (±2–3deg), Architects Daughter font
- Arrow connectors: SVG `<path>` with hand-wobble and arrowhead
- Callout bubbles: rounded rectangle with tail, dashed border
- Dimension marks: double-headed arrow with pixel/rem label
- Flow numbers: circled digit labels (`①`, `②`, etc.)

## What NOT to Do

- No pixel-perfect spacing
- No CSS gradients or shadows
- No polished icon libraries (Lucide, Heroicons)
- No real brand colors
- No glassmorphism or modern UI polish
- No lorem ipsum — use realistic placeholder labels

## Output Format

Single self-contained HTML file. All fonts loaded from Google Fonts CDN. SVG-based decorative elements inline. One viewport: desktop-first at 1280px unless mobile wireframe is requested.

## Example Use Cases

- Low-fidelity page layout explorations
- IA diagrams and user flow maps
- Concept wireframes for stakeholder review
- Interactive clickable sketches (tabs, modals, hover states)
