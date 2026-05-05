---
name: saas-landing
description: Single-page SaaS product landing page using design system tokens. Hero with product visual, features, social proof, pricing section, and CTA. Avoids generic gradient SaaS defaults.
---

# SaaS Landing Page

Use this skill to produce conversion-focused SaaS landing pages. Output is a polished, responsive single-file HTML page.

## Page Structure

Required sections in order:

1. **Nav** — Logo, links (3–5), primary CTA button
2. **Hero** — Headline, subheadline, 1–2 CTA buttons, product screenshot or demo
3. **Social proof strip** — Logos of known companies or a key metric
4. **Features** — 3 or 6 cards showing core value props
5. **How it works** — 3-step numbered flow
6. **Testimonial** — 1–2 quotes with avatar and attribution
7. **Pricing** — 2–3 tiers (Starter / Pro / Enterprise pattern or equivalent)
8. **Final CTA** — Centered conversion block with headline and button
9. **Footer** — Links, legal, social

Omit sections not relevant to the brief. Never pad with empty-looking filler sections.

## Hero Composition Rules

The hero communicates the product's actual value, not a generic marketing abstraction.

**Good hero headline patterns:**
- "[Verb] [specific outcome] [time modifier]" — "Ship features 3x faster with AI-assisted code review"
- "[Product] for [audience who does X]" — "The analytics platform for growth teams who move fast"
- Direct claim with specific proof — "Used by 50,000 developers to automate their deploys"

**Hero visual options (pick one):**
- Real product screenshot (best — ask user if available)
- Abstract product UI mockup matching the design system
- Code snippet or terminal output (for developer tools)
- Dashboard or graph mockup (for analytics/data products)

**Never use:**
- Generic floating gradient orbs
- Stock photo of people at laptops
- Abstract particles or blob backgrounds

## Features Section

Each feature card needs:
- One clear icon (SVG or Unicode geometric — no emoji)
- Specific, concrete benefit title (not vague: "Powerful", "Smart", "Easy")
- 1–2 sentence description with concrete detail

Examples of specific vs. generic:
- Vague: "Powerful analytics" → Specific: "See every user action as a timeline, searchable in real time"
- Vague: "Easy integrations" → Specific: "Connect Slack, GitHub, and Linear in 3 minutes with OAuth"

## Pricing Tier Rules

- Minimum 2 tiers, maximum 3 for landing pages
- Mark one tier as "Most Popular" or "Recommended"
- List 4–6 specific features per tier
- Include price (monthly/annual toggle optional)
- CTA per tier: "Get Started Free", "Start Trial", "Contact Sales"
- Enterprise tier: "Custom pricing" + "Contact Sales" CTA is fine

## Design Token Binding

All values from active design system:

```css
:root {
  --bg: /* background */;
  --surface: /* card surface */;
  --text: /* primary text */;
  --muted: /* secondary text */;
  --border: /* hairline borders */;
  --accent: /* CTA and highlight color */;
  --radius: /* component border radius */;
  --font-display: /* headline font */;
  --font-body: /* body font */;
}
```

## Anti-Patterns

- No "🚀 Launch your startup today" headline patterns
- No indigo/purple gradient hero backgrounds by default
- No fake user avatars stacked on top of each other (the "50+ users joined" pattern)
- No fabricated social proof metrics (don't invent "10M+ users" without briefing)
- No Lorem ipsum anywhere
