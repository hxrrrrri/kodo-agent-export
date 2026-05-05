---
name: digital-eguide
description: Interactive digital guide or e-book with chapter navigation, progress tracking, callout boxes, embedded media slots, and reading-optimized typography. Designed for educational and reference content.
---

# Digital E-Guide

Use this skill to produce interactive digital guides, e-books, handbooks, and reference documents. Output is a navigable HTML artifact with chapter structure and reading-optimized layout.

## Document Architecture

```
[Sticky header: guide title + chapter navigation]

[Cover / title page]
[Table of contents — clickable]

[Chapter 1]
  [Introduction]
  [Main content sections]
  [Summary / Key takeaways]
  [Chapter progress indicator]

[Chapter 2…N]

[Conclusion]
[Resources / Further reading]
```

## Navigation System

- **Sidebar** (desktop): fixed left, full chapter/section tree, active section highlighted via Intersection Observer
- **Top bar** (mobile): chapter dropdown + prev/next buttons
- **Progress bar**: thin bar at top showing overall reading progress
- **Section jump**: clicking TOC items scrolls smoothly to section

## Typography for Reading

```css
.guide-content {
  max-width: 720px;
  margin: 0 auto;
  font-size: 17px;
  line-height: 1.75;
  font-family: var(--font-body);
}

h1 { font-size: 2.4em; font-family: var(--font-display); }
h2 { font-size: 1.6em; margin-top: 2.5em; }
h3 { font-size: 1.2em; margin-top: 2em; }

p { margin: 0 0 1.5em; }

.chapter-number {
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 0.5em;
}
```

## Callout Box Types

```html
<!-- TIP -->
<div class="callout tip">
  <span class="callout-label">Tip</span>
  <p>Content here</p>
</div>

<!-- KEY CONCEPT -->
<div class="callout concept">
  <span class="callout-label">Key Concept</span>
  <p>Content here</p>
</div>

<!-- EXAMPLE -->
<div class="callout example">
  <span class="callout-label">Example</span>
  <p>Content here</p>
</div>

<!-- WARNING -->
<div class="callout warning">
  <span class="callout-label">Important</span>
  <p>Content here</p>
</div>
```

## Media Slots

For images, diagrams, and embedded content:

```html
<figure class="guide-figure">
  <img src="[image]" alt="Descriptive alt text">
  <figcaption>Figure 1.2 — Caption explaining the figure</figcaption>
</figure>
```

For code examples with copy button:
```html
<div class="code-block">
  <div class="code-header">
    <span class="language">JavaScript</span>
    <button class="copy-btn" onclick="copyCode(this)">Copy</button>
  </div>
  <pre><code class="language-js">…</code></pre>
</div>
```

## Key Takeaways Section

End each chapter with:
```html
<div class="chapter-summary">
  <h3>Chapter Summary</h3>
  <ul>
    <li>First key insight from this chapter</li>
    <li>Second key insight</li>
    <li>Third key insight</li>
  </ul>
</div>
```

## Progress Tracking

```javascript
// Track reading progress
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      markSectionRead(entry.target.dataset.section);
      updateProgressBar();
    }
  });
}, { threshold: 0.7 });
```

Progress saved to `localStorage` — user can resume where they left off.

## Print/Save Mode

Print-optimized CSS:
- Hide navigation sidebar
- Full-width content
- Page breaks before each chapter
- Footer with page numbers

## Quality Gates

1. All chapter TOC links scroll to correct sections
2. Progress bar moves as user reads
3. Mobile: sidebar converts to accessible dropdown
4. Copy buttons work on code blocks
5. Chapter summaries present in each chapter
