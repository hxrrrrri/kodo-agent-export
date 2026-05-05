---
name: pricing-page
description: Standalone pricing page with tier selection, feature comparison table, FAQ, and conversion CTAs. Supports monthly/annual toggle, highlighted recommended tier, and enterprise contact section.
---

# Pricing Page

Use this skill to produce a standalone pricing page. Pricing is the highest-stakes conversion surface — it must be honest, clear, and confidence-building.

## Page Architecture

1. **Header** — Product name/logo, minimal nav
2. **Headline** — Direct, clear pricing statement
3. **Billing toggle** — Monthly / Annual (annual shows savings %)
4. **Tier cards** — 2–4 tier columns
5. **Feature comparison table** — Full feature matrix below cards
6. **FAQ** — 4–6 pricing questions as accordion
7. **Enterprise strip** — Custom pricing CTA
8. **Footer** — Minimal

## Tier Card Structure

Each tier card must include:

```
[Tier name]
[1-sentence description of who it's for]
[Price] / [period]
[Annual savings if applicable]
[CTA button]
─────────────────
✓ Feature line
✓ Feature line
✓ Feature line
  ... (5–8 features)
```

**Tier naming patterns** (choose what fits):
- Free / Pro / Enterprise
- Starter / Growth / Scale
- Developer / Team / Business
- Hobby / Professional / Agency

Never use meaningless tier names like "Basic" or "Premium" without context.

## Recommended Tier Highlighting

The recommended tier gets:
- Slight vertical lift (transform: translateY(-8px))
- More prominent border (accent color at 50% opacity)
- "Most Popular" or "Best Value" badge
- Slightly larger CTA button

Only one tier gets this treatment.

## Feature Comparison Table

Full comparison table below the cards:
- Rows: features, grouped by category
- Columns: one per tier + a header column
- Use ✓ (checkmark) for included, — (dash) for not included, and specific values for limits
- Group features: Core, Collaboration, Analytics, Support, etc.
- Sticky column headers on scroll

## Billing Toggle

Monthly/Annual switch:
- Default to monthly (less commitment)
- Annual: show percentage saved (e.g., "Save 20%")
- JavaScript toggle swaps price text for each card
- Annual prices shown with monthly equivalent ("$29/mo, billed annually")

## FAQ Patterns

Common pricing FAQs to include if relevant:
- What happens when I exceed my limit?
- Can I change plans later?
- Do you offer refunds?
- Is there a free trial?
- How does billing work for teams?
- Do you have educational/nonprofit pricing?

## Enterprise Section

Always include at the bottom:
- "Need more than X seats / custom requirements?" header
- 2–3 enterprise features (SLA, SSO, audit logs, custom contracts)
- "Talk to Sales" CTA button

## Copy Discipline

- No vague tier descriptions ("Perfect for growing teams" means nothing)
- Be specific: "For teams of 5–20 who need SSO and audit logs"
- Show real prices — if prices are unknown, use realistic placeholders with [price] markers
- No hidden fees language — if there are none, say "No hidden fees"
