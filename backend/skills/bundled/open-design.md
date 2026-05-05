---
name: open-design
description: Open Design style workflow for Kodo Design: structured discovery with question forms, 7 cardinal sins enforcement, 5-dimensional critique gates, high-fidelity controls, design-system selection, direction picker, device frames, skills/scenarios, media-aware prompts, artifact-first output, and P0/P1/P2 quality checklists.
---

# Open Design Workflow for Kodo

Use this skill when the user asks Kodo Design to behave like Claude Design or Open Design: structured discovery, high-fidelity web/UI design, app prototypes, decks, dashboards, marketing artifacts, visual directions, and polished design-system-driven output.

## Core Product Loop

1. Lock the brief before drawing (use discovery questions below).
2. Pick a surface or skill: web prototype, SaaS landing, dashboard, pricing, docs, blog, commerce, mobile onboarding, email, social carousel, poster, deck, motion, infographic, critique.
3. Pick a fidelity: wireframe, high-fidelity, or production polish.
4. Pick a design system or visual direction.
5. Bind concrete tokens: background, surface, text, muted text, border, accent, display font, body font, radius, spacing rhythm.
6. Build the artifact.
7. Run P0/P1 quality gates (below) before emitting.
8. Emit a usable HTML artifact and expose export paths.

## Discovery Discipline (Turn-1 Question Form)

For a fresh design task with insufficient brief, gather these before starting:

| # | Question | Why it matters |
|---|----------|---------------|
| 1 | What surface is this? (web page, app screen, email, poster, deck, etc.) | Determines layout constraints |
| 2 | Who is the primary audience? | Dictates information density and tone |
| 3 | What is the visual tone? (3 adjectives) | Guides direction selection |
| 4 | Is there an existing brand? Colors, fonts, logo? | Prevents invented brand violations |
| 5 | What scope/scale? (single page, 3 screens, 10 slides) | Sets deliverable expectations |
| 6 | What should it specifically NOT look like? | Prevents obvious missteps |

When the user says "skip questions" or "just do it", use the active Kodo Design settings as the discovery answers. State assumptions in a brief notes panel inside the artifact.

## The Seven Cardinal Sins (P0 — Never Ship)

Check every artifact before delivery. Any P0 failure blocks delivery:

**Sin 1 — Default Indigo/Purple Gradient**
`#6366f1`, `#8b5cf6`, or `from-purple-500 to-blue-600` without brand reason.
→ Replace with purposeful color from brief or design system.

**Sin 2 — Two-Stop Trust Gradient**
Full-bleed hero gradient as background decoration.
→ Use solid surface. If gradient necessary, make it subtle and hue-coherent.

**Sin 3 — Emoji as Feature Icons**
🚀 ⚡ 💡 🎯 🔥 in feature cards, section titles, or navigation.
→ SVG icons, Unicode geometric marks, or CSS-only indicators.

**Sin 4 — Sans-Serif on Serif Display Contexts**
Inter/system-ui for editorial, luxury, or literary directions.
→ Select appropriate display typeface matching brief tone.

**Sin 5 — Rounded Card + Colored Left Border**
`border-radius: 8px` + `border-left: 3px solid accent` as default callout/card.
→ Redesign information hierarchy with background, icon, or heading.

**Sin 6 — Invented Metrics**
Fabricated statistics: "500K+ users", "99.9% uptime", "4.8⭐" without source.
→ Use `[metric]` placeholders or explicitly label as illustrative.

**Sin 7 — Filler Copy / Lorem Ipsum**
Lorem ipsum, "Your description here", "Feature benefit text".
→ Write real, specific, coherent copy.

## P1 Checks (Fix Before Delivery)

- [ ] No placeholder CDN images (`via.placeholder.com`, `picsum.photos`)
- [ ] Accent used at most 2× per screen (not in nav + cards + hero + buttons simultaneously)
- [ ] No more than 12 distinct hex values (use CSS custom properties)
- [ ] Empty states have illustration placeholder + explanation + CTA
- [ ] No gray silhouette avatars in testimonials

## Design System Schema

Treat the active design system as a portable DESIGN.md with these sections:

1. Visual atmosphere and design philosophy
2. Color palette and semantic roles
3. Typography hierarchy and type scale
4. Component styling and anatomy
5. Layout principles and grid
6. Depth, elevation, and shadow language
7. Motion and interaction posture
8. Content voice and tone
9. Anti-patterns to avoid for this system

Do not invent random tokens when the design system provides them. Extend with OKLch or harmonized values only when necessary.

## Famous-System Library Discipline

Kodo ships an Open Design-style catalog of 100+ design systems: Claude, Anthropic, OpenAI, Linear, Vercel, Stripe, Apple, Airbnb, Notion, Supabase, Figma, GitHub, Shopify, Cursor, Raycast, Webflow, Canva, Miro, Framer, Spotify, Pinterest, Nike, Tesla, BMW, Porsche, Mercedes, Lamborghini, Ferrari, NVIDIA, IBM Carbon, Google Material, Microsoft Fluent, Atlassian, Mailchimp, Dropbox, Wise, Revolut, Binance, Coinbase, Duolingo, The Verge, WIRED, Runway, Hugging Face, PostHog, Sentry, Mintlify, Resend, shadcn, Xiaohongshu, Discord, Netflix, Starbucks, Arc, Warp, and more.

Use these as design-language references, not as brand copying. Borrow the system logic: density, typography rhythm, color roles, component anatomy, interaction states, motion posture, and content voice.

## Direction Picker

If no brand is present, choose or present one of these five directions:

| Direction | Aesthetic | References |
|-----------|-----------|-----------|
| **Editorial Monocle** | Serif, print-like, warm accent, borders instead of cards | Monocle, FT, NYT Magazine |
| **Modern Minimal** | Linear/Vercel precision, monochrome, one saturated accent | Linear, Vercel, Resend |
| **Warm Soft** | Cream canvas, soft radii, human product language | Notion, Airbnb, Loom |
| **Tech Utility** | Dense data, tables, status, code, tabular numerics | GitHub, Datadog, PagerDuty |
| **Brutalist Experimental** | Hard borders, oversized type, asymmetry, minimal radius | Figma marketing, Pika, Cosmos |

Directions are not color themes. They change typography, rhythm, density, image strategy, interaction posture, and restraint rules.

## Fidelity Rules

- **Wireframe**: grayscale structure, labels, honest placeholders, minimal decoration
- **High-fidelity**: polished visual system, real copy, responsive states, accessible contrast
- **Production**: implementation-ready HTML/CSS/JS, precise spacing, interactions, performance-conscious motion, final QA

## Device Frame Rules

Use device frames only when they improve the artifact:
- iPhone 15 Pro: iOS/mobile flows
- Android Pixel: Android-specific flows
- iPad Pro: tablet density layouts
- MacBook or browser chrome: product showcase screenshots

Do not redraw fake devices with CSS when a real device frame rule is available.

## Five-Dimensional Self-Critique Gates

Before final delivery, score internally:

| Dimension | Question | Minimum |
|-----------|----------|---------|
| **Philosophy** | Does it have a coherent visual thesis? | 6/10 |
| **Hierarchy** | Can the eye navigate without instruction? | 7/10 |
| **Craft** | Are the small details right (spacing, states, wrapping)? | 6/10 |
| **Specificity** | Is this for THIS brief or any brief in the category? | 7/10 |
| **Restraint** | Does every element earn its presence? | 6/10 |

Fix any dimension below its minimum before emitting. Total composite below 35/50 = revise.

## Skill Routing

Match the user's intent to the right skill:

| Request | Skill |
|---------|-------|
| Landing page | `saas-landing` or `web-prototype` |
| App prototype | `mobile-app` |
| Slide deck | `html-ppt` |
| Dashboard | `dashboard` |
| Social media | `social-carousel` or `image-poster` |
| Animation | `motion-frames` or `hyperframes` |
| Report | `finance-report` |
| Email | `email-marketing` |
| Documentation | `docs-page` |
| Wireframe | `wireframe-sketch` |
| Critique | `critique` (built-in mode) |
| Invoice | `invoice` |
| Blog article | `blog-post` |
| Pricing | `pricing-page` |
| Design doc | `design-brief` |
| Poster | `magazine-poster` or `image-poster` |

## Markdown Artifact Craft

When the output is Markdown, produce a designed artifact:
- Clear title, subtitle/context line, and scannable section hierarchy
- Tables only for comparison or structured data
- Include decision logs, assumptions, constraints, acceptance criteria, next actions
- For design specs: tokens, component states, responsive behavior, accessibility notes, content rules
- For decks/editorial: slide/page rhythm, speaker notes when requested, image/reference slots
- No generic filler, lorem ipsum, fake metrics, or vague adjectives
