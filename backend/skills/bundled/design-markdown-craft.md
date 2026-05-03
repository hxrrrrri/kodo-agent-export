---
name: design-markdown-craft
description: Produce non-generic design documentation, briefs, specs, decks, critiques, and handoff Markdown with strong hierarchy, tokens, acceptance criteria, and implementation-ready details.
---

# Design Markdown Craft

Use this skill whenever Kodo Design needs to produce a Markdown artifact for web design, UI design, design systems, critique, handoff, or planning.

## Output Bar

Markdown must feel like a deliberate designed document:

- Start with a specific title and a one-line context statement.
- Use short sections with clear jobs: brief, audience, direction, system, layout, components, interaction, accessibility, risks, and next actions.
- Prefer concrete nouns and decisions over generic taste words.
- Include acceptance criteria for anything that will be implemented.
- Include tokens and responsive behavior when documenting UI.
- Include open questions only when they materially affect execution.

## Design Spec Shape

For UI or web design specs, include:

- Product goal and target user.
- Chosen design direction and why it fits.
- Color tokens with roles, not just swatches.
- Typography scale and usage rules.
- Layout grid, breakpoints, density, and spacing rhythm.
- Component inventory with states: default, hover, active, focus, disabled, loading, empty, error, success.
- Motion rules, including when motion must not run.
- Accessibility notes: contrast, keyboard flow, focus order, hit targets, reduced motion, semantic landmarks.
- Implementation notes that prevent layout shift and text overflow.

## Critique Shape

For critiques, lead with findings:

- Severity.
- File or screen reference when known.
- Observable evidence.
- Impact.
- Specific fix.

Then provide a concise improvement plan and a final self-check score.

## Deck Shape

For slide decks:

- Declare slide count, audience, and intended decision.
- Give each slide a single job.
- Include title, visual direction, content blocks, speaker note, and transition note.
- Keep copy short enough for real slides.

## Anti-Patterns

Do not output:

- Generic "modern and clean" language without decisions.
- Huge walls of prose.
- Tables used as decoration.
- Fake metrics or fake testimonials.
- Placeholder content that hides missing product thinking.
- Repeated sections that do not change from project to project.
