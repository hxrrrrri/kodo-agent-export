---
name: blog-post
description: Long-form editorial HTML article with structured sections, pull quotes, callouts, table of contents, author attribution, and reading-time estimate. Editorial-grade typography and layout.
---

# Blog Post

Use this skill to produce editorial-grade long-form article artifacts. Output is an HTML page formatted for reading, not for general product UI.

## Article Structure

Every blog post artifact must have:

1. **Article header** — Category tag, headline, subheadline, author, date, reading time estimate
2. **Hero image slot** — Placeholder or generated image, full-width with caption
3. **Table of contents** — For articles over 800 words, auto-generated from H2 headings
4. **Article body** — Main content with sections
5. **Pull quotes** — At least one per 500 words
6. **Code blocks** — Syntax highlighted if technical content
7. **Callout boxes** — For tips, warnings, key insights
8. **Author bio** — Avatar, name, title, optional social links
9. **Related articles** — 2–3 card grid at bottom

## Typography System

Reading-optimized text treatment:

```css
article {
  max-width: 680px;
  margin: 0 auto;
  font-size: 18px;
  line-height: 1.7;
  font-family: var(--font-body);
}

h1 { font-size: 2.5em; line-height: 1.15; font-family: var(--font-display); }
h2 { font-size: 1.6em; line-height: 1.3; margin-top: 2em; }
h3 { font-size: 1.25em; margin-top: 1.5em; }

p { margin: 0 0 1.4em; }

.pull-quote {
  font-size: 1.3em;
  line-height: 1.4;
  border-left: 3px solid var(--accent);
  padding-left: 1.5em;
  margin: 2em 0;
  font-style: italic;
  color: var(--text-secondary);
}
```

## Reading Time Calculation

Estimate: total word count ÷ 200 = minutes (round up). Display as "X min read" in the header.

## Callout Box Types

| Type | Style | Use For |
|------|-------|---------|
| `info` | Blue left border | Key information, context |
| `tip` | Green left border | Pro tips, shortcuts |
| `warning` | Yellow left border | Caveats, gotchas |
| `danger` | Red left border | Breaking changes, data loss risks |

## Article Header Metadata

```html
<header class="article-header">
  <span class="category">Engineering</span>
  <h1>The headline</h1>
  <p class="subhead">The subheadline gives context and draws readers in.</p>
  <div class="meta">
    <img class="avatar" src="…" alt="Author name">
    <div>
      <strong>Author Name</strong>
      <span>June 15, 2025 · 8 min read</span>
    </div>
  </div>
</header>
```

## Content Rules

- Headline: specific, concrete, not clickbait — tells the reader exactly what they'll learn
- Subheadline: 1–2 sentences expanding the headline with context
- First paragraph: no preamble — get to the point immediately
- Section headings: action-oriented or question-format ("How to X", "Why Y matters")
- No lorem ipsum — write realistic, coherent content matching the topic
- Code examples: real, tested-looking syntax — not pseudocode
- No padding sections: every paragraph must earn its place

## Sidebar (Optional)

For long articles, include a sticky table-of-contents sidebar on desktop:
- Fixed to the right side
- Highlights active section as user scrolls (Intersection Observer)
- Collapses to top anchor strip on mobile
