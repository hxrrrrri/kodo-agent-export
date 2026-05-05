---
name: docs-page
description: Developer documentation page with sidebar navigation, code tabs, API reference blocks, callouts, search-ready structure, and reading-optimized layout. Modeled on Mintlify/Stripe/Vercel docs quality.
---

# Documentation Page

Use this skill to produce developer or product documentation pages. Output targets the quality level of Stripe, Vercel, or Mintlify docs — clear, navigable, and developer-trusting.

## Page Layout

```
[Top navbar: logo, search, nav links, version picker, dark mode]
┌──────────────┬────────────────────────────┬─────────────┐
│ LEFT SIDEBAR │ MAIN CONTENT               │ RIGHT TOC   │
│ (240px)      │ (max-width 720px)          │ (200px)     │
│              │                            │             │
│ Doc tree:    │ Page title                 │ On this     │
│ - Section 1  │ Description                │ page:       │
│   - Page     │                            │ - Section   │
│   - Page     │ [Content sections]         │ - Section   │
│ - Section 2  │                            │ - Section   │
│   - Page     │ [Prev / Next navigation]   │             │
└──────────────┴────────────────────────────┴─────────────┘
```

## Navigation Structure

Left sidebar:
- Collapsible section groups with chevron toggle
- Active page highlighted with accent left border
- Section headers: uppercase, small, tracked
- Deep links: indent 16px per level (max 3 levels)

Right TOC (in-page navigation):
- Auto-generated from H2/H3 headings
- Active section highlighted via Intersection Observer
- Fixed on scroll

## Code Block System

Full-featured code blocks:

```html
<div class="code-block">
  <!-- Language tabs for multi-language examples -->
  <div class="tabs">
    <button class="tab active" data-lang="javascript">JavaScript</button>
    <button class="tab" data-lang="python">Python</button>
    <button class="tab" data-lang="curl">cURL</button>
  </div>
  
  <!-- Code panel -->
  <div class="code-panel" data-lang="javascript">
    <div class="code-header">
      <span class="filename">example.js</span>
      <button class="copy-btn">Copy</button>
    </div>
    <pre><code class="language-js">…</code></pre>
  </div>
</div>
```

Use Prism.js or highlight.js for syntax highlighting (CDN load).

## API Reference Blocks

For API endpoints:

```html
<div class="api-endpoint">
  <span class="method post">POST</span>
  <span class="path">/v1/messages</span>
</div>

<div class="param-table">
  <table>
    <thead>
      <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><code>model</code></td>
        <td><span class="type">string</span></td>
        <td><span class="required">Required</span></td>
        <td>The model ID to use for generation.</td>
      </tr>
    </tbody>
  </table>
</div>
```

## Callout Types

```html
<div class="callout note">
  <strong>Note</strong>
  <p>Informational context that helps understanding.</p>
</div>

<div class="callout tip">
  <strong>Tip</strong>
  <p>A helpful shortcut or best practice.</p>
</div>

<div class="callout warning">
  <strong>Warning</strong>
  <p>Something that could cause unexpected behavior.</p>
</div>

<div class="callout danger">
  <strong>Breaking Change</strong>
  <p>This change may break existing integrations.</p>
</div>
```

## Content Standards

- **First line of a page**: answer "what is this for?" in one sentence
- **Prerequisites**: list them before the main content
- **Code examples**: real, runnable code — not pseudocode
- **Links**: "Learn more about X" → link on X, not "click here"
- **Version markers**: tag content with version ranges where behavior differs
- **No assumed knowledge**: define technical terms on first use

## Prev/Next Navigation

At the bottom of every page:

```html
<nav class="doc-pagination">
  <a class="prev-page" href="[prev]">
    ← [Previous page title]
  </a>
  <a class="next-page" href="[next]">
    [Next page title] →
  </a>
</nav>
```

## Search (Simulated)

Include a functional search overlay:
- Keyboard shortcut: `⌘K` or `Ctrl+K`
- Searches page titles and headings (client-side, over rendered content)
- Results display page title + breadcrumb

## Quality Gates

1. All code blocks have copy button
2. Multi-language tabs work (JavaScript/Python/cURL at minimum)
3. Left sidebar + right TOC visible at 1280px
4. Active TOC section highlights on scroll
5. Prev/Next navigation at bottom
6. Mobile: sidebars collapse to accessible menus
7. Search overlay opens on ⌘K
