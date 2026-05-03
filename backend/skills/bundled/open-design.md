---
name: open-design
description: Open Design style workflow for Kodo Design: discovery forms, high-fidelity controls, design-system selection, direction picker, device frames, skills/scenarios, media-aware prompts, artifact-first output, and self-critique.
---

# Open Design Workflow for Kodo

Use this skill when the user asks Kodo Design to behave like Claude Design or Open Design: structured discovery, high-fidelity web/UI design, app prototypes, decks, dashboards, marketing artifacts, visual directions, and polished design-system-driven output.

## Core Product Loop

1. Lock the brief before drawing.
2. Pick a surface or skill: web prototype, SaaS landing, dashboard, pricing, docs, blog, commerce, mobile onboarding, email, social carousel, poster, deck, motion, infographic, critique.
3. Pick a fidelity: wireframe, high-fidelity, or production polish.
4. Pick a design system or visual direction.
5. Bind concrete tokens: background, surface, text, muted text, border, accent, display font, body font, radius, spacing rhythm.
6. Build the artifact.
7. Self-check for specificity, accessibility, layout stability, and AI-looking defaults.
8. Emit a usable HTML artifact and expose export paths.

## Discovery Discipline

For a fresh design task, gather:

- output type
- primary surface
- audience
- visual tone
- brand context
- scope / scale
- constraints and things to avoid

When the user wants speed or says to skip questions, use the current Kodo Design settings as the discovery answers.

## Design System Schema

Treat the active design system as a portable `DESIGN.md`:

- visual atmosphere
- color palette and roles
- typography hierarchy
- component styling
- layout principles
- depth and elevation
- motion language
- content voice
- anti-patterns

Do not invent random tokens when the design system gives them. Extend with OKLCH or harmonized values only when necessary.

## Famous-System Library Discipline

Kodo ships a large Open Design-style catalog inspired by product systems and public design languages: Claude, Anthropic, OpenAI, Linear, Vercel, Stripe, Apple, Airbnb, Notion, Supabase, Figma, GitHub, Shopify, Cursor, Raycast, Webflow, Canva, Miro, Framer, Spotify, Pinterest, Nike, Tesla, BMW, NVIDIA, IBM Carbon, Google Material, Microsoft Fluent, Atlassian, Mailchimp, Dropbox, Wise, Revolut, Coinbase, Duolingo, The Verge, WIRED, Runway, Hugging Face, PostHog, Sentry, Mintlify, Resend, shadcn, and Xiaohongshu.

Use these as design-language references, not as brand copying. Preserve the user's product identity while borrowing the system logic: density, typography rhythm, color roles, component anatomy, interaction states, motion posture, and content voice.

## Direction Picker

If no brand is present, choose or present one of these directions:

- Editorial Monocle: serif, print-like, warm accent, borders instead of cards.
- Modern Minimal: Linear/Vercel precision, monochrome, one saturated accent.
- Warm Soft: cream canvas, soft radii, human product language.
- Tech Utility: dense data, tables, status, code, tabular numerics.
- Brutalist Experimental: hard borders, oversized type, asymmetry, minimal radius.

Directions are not color themes. They change typography, rhythm, density, image strategy, interaction posture, and restraint rules.

## Fidelity Rules

- Wireframe: grayscale structure, labels, honest placeholders, minimal decoration.
- High-fidelity: polished visual system, real copy, responsive states, accessible contrast.
- Production: implementation-ready HTML/CSS/JS, precise spacing, interactions, performance-conscious motion, final QA.

## Device Frame Rules

Use device frames only when they improve the artifact:

- iPhone 15 Pro for iOS/mobile flows.
- Android Pixel for Android flows.
- iPad for tablet density.
- MacBook or browser chrome for product showcase screenshots.

Do not redraw fake devices if Kodo or the prompt provides a reusable frame rule.

## Self-Critique

Before final delivery, score internally:

1. Philosophy match.
2. Visual hierarchy.
3. Execution craft.
4. Specificity to this brief.
5. Accessibility and usability.
6. Restraint.

Fix any weak dimension before emitting the final artifact.

## Markdown Artifact Craft

When the output is Markdown, produce a designed artifact rather than plain notes:

- Use a clear title, subtitle/context line, and scannable section hierarchy.
- Use tables only for comparison or structured data; avoid decorative tables.
- Include decision logs, assumptions, constraints, acceptance criteria, and next actions when useful.
- For design specs, include tokens, component states, responsive behavior, accessibility notes, and content rules.
- For decks or editorial docs, include slide/page rhythm, speaker notes when requested, and image/reference slots.
- Avoid generic filler, lorem ipsum, fake metrics, and vague adjectives.

## Anti-Patterns

Avoid generic AI design signatures:

- default purple/blue gradient hero
- meaningless floating blobs
- glass cards everywhere
- emoji feature icons
- fake metrics
- lorem ipsum
- CSS-only fake product screenshots
- oversized marketing hero for utilitarian tools
- one-note color palettes
- text overlap and unstable responsive layout
