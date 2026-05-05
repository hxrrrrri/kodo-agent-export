---
name: social-carousel
description: Three-card 1080x1080 social media carousel with cinematic panels, connected headlines forming one coherent sentence, dark full-bleed background, brand chip, and micro index labels.
---

# Social Carousel

Use this skill to produce Instagram/LinkedIn/social media carousel posts as a self-contained HTML artifact. Three horizontally arranged square panels that tell one connected story.

## Canvas Specification

- Each card: 1080px × 1080px (square)
- Layout: Three cards side-by-side horizontally
- Total artifact width: 3240px (three cards) — rendered at 33% scale in browser for preview
- Desktop display: Cards visible side-by-side; below 1100px, stack vertically
- Snap points: CSS scroll-snap for swipe simulation

## Card Architecture

Each card is a full-bleed cinematic composition:

```
┌─────────────────────────────┐
│ [brand-chip] [micro-index]  │  ← top strip, 10% height
│                             │
│    HEADLINE TEXT            │  ← center, display type
│    secondary line           │
│                             │
│    [body text if needed]    │  ← bottom 30%
└─────────────────────────────┘
```

## Headline Rule

The three card headlines must form one grammatically coherent sentence when read left to right.

**Example:**
- Card 1: "Most founders ignore"
- Card 2: "the one metric that"
- Card 3: "actually drives growth."

Each card headline is visually large and standalone, but the narrative only completes across all three.

## Visual System

- Background: dark full-bleed — `#0a0a0a`, `#0f0f1a`, or brand dark surface
- Brand chip: top-left, small pill with logo/name, subtle border, 12px text
- Micro index: top-right, `01 / 03` format, monospace, muted
- Headline: display serif or bold sans, 72–96px equivalent at 1080px scale
- Body text (optional): 24–28px, weight 400, line-height 1.4, muted color
- Accent: single color for highlight, underline, or keyword emphasis only

## Typography

- Headline: strongest weight, negative tracking (-0.02em to -0.03em)
- Max 3 lines per headline at card scale
- Avoid centered text if more than 2 lines — left-align for readability

## Color Discipline

- Backgrounds: dark neutrals or brand dark surface
- Text: near-white (`#f5f5f5` or `#e8e8e8`)
- Accent: one color, used for maximum 2 elements across all 3 cards
- No gradient backgrounds unless brand requires it

## What NOT to Do

- No rainbow gradient backgrounds
- No more than 3 cards per set
- No lorem ipsum
- No emoji in headlines
- No more than 40 words per card
- Headlines must not be independent statements — they connect

## Export Notes

Each card can be individually screenshotted at 1080×1080 for posting. The HTML artifact simulates the swipe experience inline.
