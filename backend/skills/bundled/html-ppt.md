---
name: html-ppt
description: Professional HTML presentation deck with 36 theme variants, 15 full-deck templates, keyboard navigation, presenter mode (S key), speaker notes, and 16:9 slide frames. Browser-native slide deck.
---

# HTML Presentation Deck (html-ppt)

Use this skill to build browser-native slide decks. Output is a single HTML file with keyboard navigation, themed slides, and optional presenter mode.

## Core Navigation

- **Arrow keys** or **mouse click**: next/prev slide
- **S key**: toggle presenter mode (floating card with current slide preview, next slide, speaker notes, timer)
- **F key**: fullscreen
- **Escape**: exit fullscreen
- **Number + Enter**: jump to slide N

## Slide Frame

All slides are 16:9 at 1920×1080px internal coordinates, scaled to browser viewport:

```css
.slide {
  width: 1920px;
  height: 1080px;
  transform-origin: top left;
  /* scaled via JS to fit viewport */
}
```

JavaScript scales slides:
```javascript
function scaleSlides() {
  const scale = Math.min(
    window.innerWidth / 1920,
    window.innerHeight / 1080
  );
  document.querySelectorAll('.slide').forEach(s => {
    s.style.transform = `scale(${scale})`;
  });
}
```

## Slide Archetypes

Every deck is built from these reusable slide types:

| Archetype | Layout |
|-----------|--------|
| `cover` | Full-bleed, large headline, subtitle, speaker + date |
| `section-break` | Single large number or label, divider |
| `title-body` | Left headline, right body text |
| `two-col` | Equal split, content or text+image |
| `three-col` | Feature cards or comparison |
| `full-bleed-quote` | Large pull quote, centered |
| `data-heavy` | Chart + key insight label |
| `timeline` | Horizontal or vertical event sequence |
| `team` | Grid of avatar + name + title |
| `closing` | Thank you, contact, next steps |

## Theme System (36 Variants)

Each theme is a CSS variable override. Key themes:

**Minimal group:** minimal-white, minimal-dark, minimal-slate
**Color group:** indigo-bold, emerald-fresh, rose-warm, amber-editorial
**Editorial group:** magazine-serif, newspaper-mono, academic-formal
**Dark group:** pitch-dark, midnight-blue, forest-deep
**Branded:** vercel-dark, linear-minimal, stripe-fintech, apple-clean
**Experimental:** neo-brutal, risograph-print, dithered-noise, blueprint

Apply theme by setting `data-theme` on `<body>`:
```html
<body data-theme="magazine-serif">
```

## Speaker Notes

Place speaker notes in each slide as hidden divs:
```html
<div class="notes" style="display:none;">
  This slide covers the Q3 results. Key point: revenue exceeded target by 12%.
  Mention the EMEA expansion as the primary driver. Pause for questions here.
</div>
```

Presenter mode reads `.notes` content and displays alongside slide thumbnail.

## Presenter Mode (S Key)

Floating draggable card system:
- **Slide preview**: scaled thumbnail of current slide
- **Next slide**: thumbnail of upcoming slide
- **Speaker notes**: full text from `.notes` div
- **Timer**: elapsed time since deck started (HH:MM:SS)
- **Controls**: prev/next buttons
- Draggable, resizable, dismissable

## Deck Templates (15 Pre-Built)

| Template | Use Case |
|----------|---------|
| `pitch-deck` | Startup fundraising (Problem/Solution/Market/Traction) |
| `product-launch` | New product announcement |
| `tech-sharing` | Engineering talk / tech deep-dive |
| `weekly-report` | Team weekly update |
| `course-module` | Educational lesson structure |
| `knowledge-arch` | Architecture / system design walkthrough |
| `qbr-review` | Quarterly business review |
| `design-review` | Design critique and showcase |
| `project-kickoff` | Project initiation and alignment |
| `year-in-review` | Annual retrospective |
| `sales-deck` | Customer-facing sales presentation |
| `investor-update` | Quarterly investor update |
| `team-offsite` | Workshop or team strategy session |
| `conference-talk` | Public speaking / conference |
| `onboarding` | New hire or user onboarding flow |

## Slide Count Guidelines

- Pitch deck: 10–14 slides
- Weekly report: 6–8 slides
- Tech deep-dive: 12–18 slides
- Course module: 8–12 slides

## Quality Gates

1. Keyboard navigation works (left/right arrows)
2. Slides scale correctly to viewport
3. Speaker notes present on at least 50% of slides
4. Slide numbers visible
5. Cover slide includes date and speaker name
6. No lorem ipsum
7. All slides readable at 1920×1080
