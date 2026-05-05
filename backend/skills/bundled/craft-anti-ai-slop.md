---
name: craft-anti-ai-slop
description: Anti-AI-slop enforcement guide. Seven cardinal sins (auto-enforced), soft polish tells, distinctiveness formula, and five-dimensional self-critique gates. Apply before delivering any design artifact.
---

# Anti-AI-Slop Enforcement

This guide enforces quality gates that prevent generic, AI-signature design outputs. Apply these checks before delivering any design artifact.

## The Seven Cardinal Sins (P0 — Never Ship)

These are auto-failures. If any of these appear in an output, fix before delivery.

**1. Default Tailwind Indigo / Purple Gradient**
- `#6366f1`, `#8b5cf6`, `from-purple-500 to-blue-600` as hero or brand color without explicit brand reason
- Fix: Replace with a purposeful, specific color derived from the brief or design system

**2. Two-Stop Trust Gradient**
- Linear gradient hero backgrounds: `linear-gradient(135deg, #667eea, #764ba2)`
- Fix: Use a solid color surface. If gradient needed, make it subtle and hue-coherent

**3. Emoji as Feature Icons**
- 🚀 ⚡ 💡 🎯 🔥 💪 as feature icons or section markers
- Fix: Use clean SVG icons, Unicode geometric marks, or pure-CSS indicators

**4. Sans-Serif on Serif Display Text**
- Using Inter/system-ui for a brief that calls for editorial, luxury, or literary direction
- Fix: Select an appropriate display typeface matching the brief's tone

**5. Rounded Card + Colored Left Border**
- `border-radius: 8px` card with a 4px `border-left: 3px solid var(--accent)` — the "info callout default"
- Fix: Redesign the information hierarchy. Use a full background, icon, or section heading instead

**6. Invented Metrics**
- "500K+ users", "99.9% uptime", "4.8/5 stars" without source in brief
- Fix: Leave metric placeholders as `[metric]` markers, or use self-evidently illustrative data labeled as such

**7. Filler Copy / Lorem Ipsum**
- `Lorem ipsum dolor sit amet`, "Your description here", "Feature benefit text"
- Fix: Write real, specific, coherent copy matching the product and audience in the brief

---

## Soft Polish Tells (P1 — Fix Before Delivery)

These don't auto-fail but signal generic AI output:

**Placeholder CDNs**: `via.placeholder.com`, `picsum.photos`, `images.unsplash.com` as real images
→ Use CSS-based placeholders with aspect-ratio and sensible backgrounds

**Excess hex values**: More than 12 distinct color values in a single artifact
→ Consolidate to CSS custom properties using the 4-layer palette system

**Overuse of accent color**: Accent appears in navigation, cards, backgrounds, AND buttons simultaneously
→ Enforce the 2-uses-per-screen rule from craft-color

**Missing `data-od-id` attributes**: Interactive elements lack semantic identification
→ Add `data-od-id` attributes to all primary interactive elements

**Flat empty states**: Empty states with just "No data found" text
→ Include an illustration placeholder, a helpful explanation, and a clear CTA

**Generic testimonial avatars**: Gray circle silhouettes for testimonial sections
→ Use generated initials avatars or gradient placeholders with real initials

---

## The Distinctiveness Formula

Every output should follow approximately:

**80% proven patterns + 20% distinctive choice**

Proven patterns = standard UX that users understand (nav at top, CTA as button, form labels above fields)

Distinctive choice = one or two deliberate, specific design decisions that make this artifact memorable:
- A specific font pairing unusual for the category
- A grid structure that breaks the expected symmetry
- A color that's unexpected but coherent with the brand
- A typographic scale relationship that creates visual tension

Do not innovate everything — that produces chaotic output. Do not copy everything — that produces generic output.

---

## Five-Dimensional Self-Critique Gates

Before delivering any design artifact, score it internally on these five dimensions:

### 1. Philosophy (0–10)
Does the design have a coherent visual thesis? Would you be able to describe its aesthetic in 2 sentences? A 5 means "functional but viewpoint-free." A 9 means "unmistakably this specific aesthetic."

**Minimum acceptable score: 6**

### 2. Visual Hierarchy (0–10)
Can the eye navigate the page without instruction? Is there a clear primary element, secondary elements, and supporting details? A 5 means "equal weight everything." A 9 means "one thing demands attention first, then a clear reading path follows."

**Minimum acceptable score: 7**

### 3. Execution Craft (0–10)
Are the small details right? Consistent spacing, proper type treatment, no awkward wrapping, hover states that feel deliberate. A 5 means "correct but not careful." A 9 means "every detail was considered."

**Minimum acceptable score: 6**

### 4. Specificity (0–10)
Is this made for THIS brief, or would it work equally well for any brief in the category? A 5 means "SaaS landing page for a tech company." A 9 means "analytics dashboard for growth teams at B2B SaaS companies who care about pipeline velocity."

**Minimum acceptable score: 7**

### 5. Restraint (0–10)
Was anything added that shouldn't be there? Gratuitous animation, decorative elements, excessive whitespace, features the brief didn't ask for. A 5 means "probably fine, kind of noisy." A 9 means "nothing is here that doesn't earn its presence."

**Minimum acceptable score: 6**

### Composite Gate

If any dimension scores below its minimum acceptable score, **fix it before delivery.** Do not ship a design that fails any dimension.

Total composite score below 35/50 = insufficient. Revise.

---

## Discovery Questions (Before Starting)

For any fresh design task, lock these before drawing:

1. **Surface**: What kind of artifact? (web, app, deck, email, poster, etc.)
2. **Audience**: Who is the primary user? Their role, context, and sophistication?
3. **Tone**: What are 3 adjectives describing the desired feeling?
4. **Brand**: Is there an existing brand? What is the key visual constraint?
5. **Scope**: How many screens/sections/pages?
6. **Avoid**: What should the output specifically NOT look like?

If the user says "skip questions," use the active Kodo Design settings as the answers. Never skip discovery entirely — at minimum, confirm the surface and audience.
