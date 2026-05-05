---
name: hyperframes
description: HTML-to-video motion graphics framework. Establishes visual identity first, then composes GSAP-driven timeline animations targeting MP4 export. Non-negotiable: timelines start paused, gsap.from() for entrances, finite repeats.
---

# HyperFrames

Use this skill to build HTML-based motion graphics targeting video/MP4 export. HyperFrames treats HTML+CSS+GSAP as the composition source, with the daemon rendering to video via headless browser.

## Hard Gate: Visual Identity First

**Do not write animation code before establishing visual identity.**

Required before starting:
1. Design system locked (colors, fonts, spacing rhythm)
2. Layout composition defined (where elements sit at rest)
3. Brand assets resolved (logo, palette, typefaces)

If these are missing, define a `visual-style.md` inline in the artifact first.

## Technology Stack

- **GSAP** (loaded from CDN) — all timeline animation
- **CSS**: layout, base styles, element positioning
- **No canvas, no WebGL** — DOM-only for reliable headless capture

Load GSAP:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

## Non-Negotiable Animation Rules

1. **All timelines start paused**: `const tl = gsap.timeline({ paused: true })`
2. **Use `gsap.from()` for entrances** — elements exist at rest state in HTML
3. **Finite repeats only** — no `repeat: -1` (infinite) on main sequences
4. **No `visibility` or `display` animations** — use `opacity` and `scale`
5. **Ease functions**: `power2.out` for most entrances, `power4.inOut` for dramatic reveals

## Timeline Structure

```javascript
const tl = gsap.timeline({ paused: true });

// Phase 1: Environment build (0–1s)
tl.from('.background-element', { opacity: 0, duration: 0.5 })

// Phase 2: Primary content entrance (1–3s)
tl.from('.headline', { y: 40, opacity: 0, duration: 0.8, ease: 'power2.out' }, '-=0.2')
tl.from('.subhead',  { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.4')

// Phase 3: Supporting elements (3–5s)
tl.from('.feature-item', { x: -20, opacity: 0, stagger: 0.15, duration: 0.5 })

// Phase 4: Hold / breathe (5–7s)
// Nothing — hold final state

// Phase 5: Outro (7–8s)
tl.to('.content', { opacity: 0, y: -10, duration: 0.5, stagger: 0.1 })

// Play on load
window.addEventListener('load', () => tl.play());
```

## Layout Rules

- Fixed viewport: `width: 1920px; height: 1080px` (16:9) for most exports
- Or `width: 1080px; height: 1080px` for square social exports
- All elements positioned absolutely or with fixed grid — no flex/grid that reflows
- Use `will-change: transform, opacity` on animated elements

## Pre-Export Validation

Before declaring complete:
1. `tl.duration()` returns expected length (within ±0.2s of spec)
2. All text renders without fallback fonts (fonts loaded before play)
3. No invisible elements at frame 0 (elements are visible in HTML, GSAP animates them in)
4. No console errors
5. Screenshot at `tl.progress(0.5)` shows expected mid-composition

## Deliverable Format

Single HTML file with:
- Embedded GSAP via CDN
- All styles inline or in `<style>` block
- Timeline exposed as `window.__tl` for daemon control
- Export metadata comment at top: duration, fps, resolution
