---
name: huashu-design
description: High-fidelity design workflow for Kodo Design Studio: web/UI design, app prototypes, decks, motion design, infographics, variations, brand asset protocol, anti-generic visual rules, and expert critique.
---

# Huashu Design Workflow for Kodo

Use this skill when the user asks for web design, UI design, app prototypes, HTML demos, slide decks, motion design, infographics, visual directions, or design critique.

## Core Standard

Produce a finished visual artifact, not a generic generated page. HTML is the production medium, but the output may be a website, app prototype, deck, motion piece, infographic, or critique dashboard.

Every result should be specific enough to the user's product, audience, data, and brand that it does not look AI-generated.

## Fact Verification First

If the task mentions a specific brand, product, technology, public figure, release, event, or current version, verify facts before making claims. Confirm existence, latest status, product visuals, UI screenshots, specs, naming, and source links where available.

Do not rely on memory for recent or brand-specific facts.

## Core Asset Protocol

For brand or product work, collect and use assets in this priority order:

1. Logo: mandatory for any specific brand.
2. Product images or renders: mandatory for physical products.
3. UI screenshots: mandatory for apps, SaaS, websites, and digital products.
4. Colors: extract from official sources or assets when possible.
5. Fonts: infer from official CSS or guidelines when possible.
6. Brand guidelines, press kits, App Store/Play Store screenshots, docs, and launch material.

If assets are unavailable, state assumptions inside the generated artifact and use honest placeholders. Do not draw fake products with CSS/SVG when a real product image is needed.

## Anti-Generic Rules

Avoid:

- purple-blue gradient SaaS defaults
- emoji used as product icons
- random floating orbs, blobs, bokeh, and fake galaxy backgrounds
- generic glass cards everywhere
- stock-photo-like dark blurred hero images
- fake charts with no labels
- lorem ipsum
- CSS silhouettes standing in for real product imagery
- Inter-as-display-type for every visual direction

Prefer:

- concrete product-specific content
- distinctive typography pairings
- editorial grids and meaningful whitespace
- real data labels and UI states
- accessible contrast and focus states
- responsive constraints that prevent text overlap
- realistic empty, loading, error, and selected states

## Design Direction Advisor

When the brief is vague, do not guess one generic style. Generate three differentiated directions in one artifact. Each direction needs:

- a name
- visual thesis
- layout strategy
- type and color strategy
- interaction or motion strategy
- tradeoffs
- recommended choice

The three directions must be meaningfully different, not color swaps.

## Junior Designer Flow

For substantial work:

1. State assumptions inside the artifact as a small design brief or notes panel.
2. Build a visible first pass with real structure.
3. Add real content, interactions, and variants.
4. Apply a craft pass: hierarchy, spacing, responsiveness, contrast, states.
5. Verify obvious interactions and layout breakpoints before delivery.

## Output Modes

### Web Design

Build a complete responsive experience. The first viewport must communicate the actual product or offer. SaaS and operational tools should feel dense, useful, and scannable, not like a generic marketing shell.

### App Prototype

Build a clickable prototype with stateful navigation. Default to 4-7 screens shown as an overview board unless the user requests a single flow. Each screen needs product-specific information density.

### Slide Deck

Build a 16:9 HTML deck, not a web page. Use 1920x1080 slide frames, varied slide archetypes, readable type, 1-indexed slide labels, and speaker notes.

### Motion Design

Build a staged animation with scene phases, timeline, readable text beats, replay controls, and recording-ready layout. Use purposeful easing and avoid constant meaningless motion.

### Infographic

Build an editorial visual explanation with precise grid, clear reading path, labeled data, and export-friendly composition.

### Critique

Score the design across philosophy coherence, hierarchy, craft, usability, accessibility, and originality. Provide Keep, Fix, Quick Wins, and a concrete improved version when source exists.
