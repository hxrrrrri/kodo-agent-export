---
name: tweaks
description: Wraps any HTML artifact with live parameterized controls — accent color, type scale, spacing density, theme toggle, and motion level. Provides real-time visual tweaking without code edits.
---

# Tweaks

Use this skill to add a live control panel to any existing HTML artifact. The panel floats over the content and exposes design parameters that re-render the artifact instantly via CSS custom property updates.

## Control Panel Architecture

A fixed floating panel, typically bottom-right or collapsible sidebar:

```
┌──────────────────────────────┐
│ ⚙ Design Tweaks        [×]  │
│                              │
│ Accent Color                 │
│ ○○○○○○○○○○  [#6366f1]        │
│                              │
│ Type Scale                   │
│ [─────●─────]  100%          │
│                              │
│ Density                      │
│ [Compact] [Default] [Airy]   │
│                              │
│ Theme                        │
│ [Light] [Dark] [System]      │
│                              │
│ Motion                       │
│ [None] [Subtle] [Full]       │
└──────────────────────────────┘
```

## Parameters and Effects

### Accent Color
- Color picker + 5 preset swatches
- Updates `--accent` CSS variable globally
- All buttons, links, highlights, and active states update instantly

### Type Scale
- Slider: 75% – 130%
- Updates `font-size` on `:root` — all `em`-based sizes scale proportionally
- Display: current multiplier percentage

### Density
- Three presets: Compact / Default / Airy
- Updates `--spacing-unit` CSS variable
  - Compact: `--spacing-unit: 0.75` (multiply all spacing by 0.75)
  - Default: `--spacing-unit: 1`
  - Airy: `--spacing-unit: 1.4`

### Theme
- Light / Dark / System
- Toggles `data-theme` attribute on `<html>`
- CSS handles via `[data-theme="dark"] { … }` rules
- System: uses `prefers-color-scheme` media query

### Motion
- None / Subtle / Full
- Updates `--motion-scale` CSS variable
  - None: sets `animation-duration: 0.001ms` globally
  - Subtle: `--motion-scale: 0.5` — all animations at half speed/distance
  - Full: `--motion-scale: 1`

## Implementation Pattern

```javascript
// Apply all tweaks via CSS custom properties
function applyTweak(property, value) {
  document.documentElement.style.setProperty(property, value);
}

// Save state to localStorage
function saveTweaks(state) {
  localStorage.setItem('kodo-tweaks', JSON.stringify(state));
}

// Restore on load
function restoreTweaks() {
  const saved = JSON.parse(localStorage.getItem('kodo-tweaks') || '{}');
  Object.entries(saved).forEach(([k, v]) => applyTweak(k, v));
}
```

## Panel Behavior

- Collapsed by default — toggle via floating button (gear icon, bottom-right)
- Panel remembers open/closed state
- Tweaks persisted to `localStorage` — survive page refresh
- "Reset to defaults" button restores original values
- Export: "Copy CSS variables" button copies current state as CSS snippet

## Wrapping Existing Artifacts

When adding tweaks to an existing artifact:
1. Identify all hardcoded color, size, and spacing values
2. Convert to CSS custom properties
3. Ensure dark-theme variant defined
4. Inject the tweaks panel HTML + script at end of `<body>`
5. Do not break existing functionality

## Quality Gates

1. Color picker updates accent everywhere in under 16ms (smooth)
2. Type scale slider does not cause layout overflow
3. Dark theme: all text meets 4.5:1 contrast
4. Tweaks persist on page reload
5. Reset button works correctly
