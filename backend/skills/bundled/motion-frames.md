---
name: motion-frames
description: Single-frame motion-design composition with looping CSS animations. Full-bleed stage, rotating SVG rings, central focal mark, display serif headline, and frame chrome. CSS @keyframes only — no JavaScript.
---

# Motion Frames

Use this skill to create single-screen motion design compositions — kinetic typography, animated brand cards, loop-ready social media visuals, and motion posters.

## Core Constraint

**CSS `@keyframes` only — no JavaScript animation.** This ensures deterministic capture, consistent looping, and iframe safety.

## Composition Architecture

Build in layers from bottom to top:

```
Layer 5: Frame chrome (corner marks, grid lines, metadata strip)
Layer 4: Display headline (centered or offset, serif/display type)
Layer 3: Ring labels (rotating text around orbital paths)
Layer 2: Central focal mark (geometric shape, logo, monogram)
Layer 1: SVG orbital rings (3 rings, different radii, different speeds)
Layer 0: Full-bleed stage background (dark surface or gradient)
```

## Animation System

Standard keyframe set to use:

```css
@keyframes rotate-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes rotate-med  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes rotate-fast { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
@keyframes pulse       { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes marquee-fade { 0% { opacity: 0; transform: translateY(8px); } 20%, 80% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes globe-spin  { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
```

Speed assignments:
- Outer ring: `rotate-slow` 20s linear infinite
- Middle ring: `rotate-med` 12s linear infinite reverse
- Inner ring: `rotate-fast` 7s linear infinite

## SVG Ring System

Three concentric circular paths using SVG `<circle>` or `<ellipse>` with `stroke` and no fill:
- Outer: 85% of stage width, 1px stroke, 20% opacity
- Middle: 60% of stage width, 1.5px stroke, 35% opacity
- Inner: 35% of stage width, 2px stroke, 50% opacity

Ring labels: small caps text on a `<textPath>` following each ring arc.

## Headline Rules

- Use a display or editorial serif font loaded from Google Fonts
- Set at 10–15% of stage width (large, cinematic scale)
- Tight tracking: -0.03em to -0.05em
- Maximum 3 words for hero line; supplementary line at 40% weight
- Stagger entrance with `marquee-fade` at 0.8s delay

## Frame Chrome

Minimal corner marks (L-shaped, 2px, 30px arms) at all four corners.
Optional: single-line metadata strip at bottom — monospace, 11px, muted.

## Background Options

- Pure dark: `#050505` or `#0a0a0f`
- Gradient radial from center accent to dark edges
- Textured: subtle noise overlay at 3% opacity

## Quality Gates

1. All animations loop seamlessly (start = end state)
2. No animation `fill-mode: forwards` — resets are intentional
3. No layout shift on loop
4. Legible headline at 100% zoom
5. No JavaScript — pure CSS
