---
name: ui-polish
description: Use this skill for UI quality passes on existing interfaces — fix-and-polish, improve-this-screen, make-this-feel-right, density tuning, state-coverage audits, micro-interaction work, accessibility hardening. Triggers on "polish this", "make it feel better", "improve UX", "this looks rough", "tighten up the UI", "make it more responsive", "add the missing states", "this needs love". Different from web-prototype (greenfield page) and from craft-color/typography (universal rules): ui-polish is the discipline of taking a working but unpolished interface and bringing every state, every interaction, every density tier to a delivered standard. Do NOT use for fresh greenfield design or visual overhauls — use design-brief or web-prototype.
---

# UI Polish

The discipline of taking working-but-rough into delivered-and-felt. The output is not new screens — it's missing states, missing affordances, missing transitions, and missing care.

## What polish actually means

Polish is not "add more visual flourish." Polish is:

1. **Every state covered.** Empty, loading, error, success, partial, offline, denied, disabled, hover, focus, active, selected, dragging, dropping. The interface communicates honestly in every condition.
2. **Every interaction has feedback.** No click goes nowhere. No keystroke disappears. Every reversible action has a visible consequence.
3. **Every density tier works.** Mobile narrow, tablet, desktop, wide desktop. No layer scrolls horizontally; nothing is unreachable; touch targets are touchable.
4. **Every keyboard path works.** Tab order is sane, focus is always visible, escape closes things, enter submits, arrows navigate.
5. **Every animation justifies itself.** Motion conveys causation, masks latency, or directs attention. Decorative animation gets cut.

Polish is the work of completion, not addition.

## State coverage matrix

Every interactive element / data view should cover these states or explicitly opt out:

| State | When | Visual signal |
|-------|------|--------------|
| **Idle** | nothing happening | default appearance |
| **Hover** | pointer over (desktop only) | subtle elevation, border, or background shift |
| **Focus** | keyboard or programmatic focus | clear, accessible ring (3:1 contrast minimum) |
| **Active / pressed** | mid-click | inset / depressed / brightness shift |
| **Disabled** | action unavailable | reduced opacity (0.4-0.5), no hover, no cursor pointer, tooltip explaining why |
| **Loading** | data fetching | skeleton / spinner / progress; never blank |
| **Empty** | no data, valid state | illustration or icon + explanation + next action |
| **Error** | data fetch failed | error icon + plain-language message + retry |
| **Partial** | some data loaded, some pending | render what's loaded, show shimmer for the rest |
| **Offline** | network unavailable | indicator + cached content where possible |
| **Permission denied** | user lacks access | explanation + path to request access (if available) |
| **Success** | action completed | feedback (toast, inline confirmation), then return to idle |
| **Selected** | item in selection | clear marker (checkbox, border, accent fill) |
| **Dragging** | item being moved | reduced opacity on source, drop zones highlighted |
| **Read-only** | view-only mode | visually distinct from editable (no input border, no cursor) |

For each interface element, answer: which states are reachable? For every reachable state, is there a clear visual?

The empty/loading/error trio is the most-skipped. A "perfect" happy path with a blank screen on empty is not polished.

## Empty state taxonomy

Empty states are not "no data." They are messages. Three categories:

### First-time empty
The user has never had data here. Onboarding moment.

```
Components:
  - Illustration or large icon (matching aesthetic, not stock)
  - Heading: what this section is *for*
  - 1-2 sentence explanation of what shows up here
  - Primary CTA to get started
  - Optional: "Learn more" link
```

### User-cleared empty
The user had data, removed it. They know what this is.

```
Components:
  - Brief acknowledgment ("All clear" / "Nothing in inbox")
  - Optional: secondary action (settings, archived items)
```

### Filtered empty
Data exists but filter / search excludes everything.

```
Components:
  - Acknowledgment of the filter ("No results for 'foo'")
  - "Clear filter" / "Reset" action
  - Optional: suggestion ("Try fewer keywords")
```

The same `<EmptyState>` component for all three is wrong. They are different communicative situations.

## Loading state taxonomy

Loading is not just a spinner. Match the loading shape to what the user expects:

| Loading type | Best UI | When |
|--------------|---------|------|
| **Skeleton** | gray placeholders matching the eventual layout | <2s, predictable shape |
| **Spinner inline** | small, in-place | <1s, single action |
| **Progress bar** | known % | uploads, exports, anything with measurable progress |
| **Optimistic** | render expected outcome immediately | mutations the user expects to succeed |
| **Streaming** | render chunks as they arrive | long server responses, AI output |
| **Lazy** | don't show until data takes >150ms | snappy operations — avoid the flash of spinner |

Apply the **150ms rule**: if a load completes in under 150ms, don't show a loading state at all. Showing then immediately hiding causes a flash that feels broken.

Apply the **400ms rule**: anything over 400ms needs an explicit loading indicator, or users will assume the action didn't register.

## Error state discipline

A good error state:
- Names *what* failed in plain language ("Couldn't save your changes")
- Names *why* if knowable ("Network connection lost")
- Offers *what next* ("Retry" / "Save offline" / "Contact support if this keeps happening")
- Preserves the user's input — never makes them retype

A bad error state:
- Shows a stack trace
- Says "Something went wrong" with no path forward
- Disappears the user's draft
- Blames the user when the system is at fault

Error message ladder:

| Severity | Treatment |
|----------|-----------|
| **Recoverable, transient** | toast or inline message + retry, auto-dismiss after 4s |
| **Recoverable, persistent** | inline error in context, persists until fixed |
| **Action blocked, fixable** | red border + message under the field |
| **Catastrophic** | full-page error with explanation and contact path |

Toast errors that the user cannot do anything about are a smell — fix the system or hide them.

## Density tiers

Most interfaces serve two-to-three densities:

| Density | Vertical spacing | Use |
|---------|------------------|-----|
| **Compact** | 4-8px between rows | Pro/admin tools where users scan many items |
| **Default** | 12-16px | General consumer surfaces |
| **Roomy** | 20-32px | Marketing, onboarding, low-density screens |

Density should be a deliberate choice per surface, not an accident of how the components were built. A dashboard with consumer-level vertical spacing wastes a third of the screen. A consumer setting with compact density looks cramped.

If your component library has a `size` or `density` prop, use it consistently — don't mix `compact` rows with `default` headers.

## Touch targets

Every clickable element must have a touch target ≥ 44×44 CSS pixels, even if the visible target is smaller. Pad with invisible click area.

```css
.icon-button {
  width: 24px;
  height: 24px;
  /* visible icon size */

  padding: 10px;
  /* invisible touch padding to reach 44x44 */

  margin: -10px;
  /* keep visual layout the same */
}
```

Touch target violations are the #1 mobile UX failure. Audit every icon button, every link in a paragraph, every checkbox.

## Focus management

Keyboard users navigate exclusively by `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, and arrow keys. Polish requires:

- **Visible focus ring on every focusable element.** Never `outline: none` without a replacement. The replacement must have ≥3:1 contrast with the background.
- **Logical tab order.** DOM order should match visual order. If they diverge, fix DOM order, don't use `tabindex` to paper over it.
- **Focus trap in modals.** Tab cycles within the modal. Escape closes. First focusable element receives focus on open. Previously-focused element receives focus on close.
- **Skip links** for repeated navigation. "Skip to main content" as the first focusable element on every page.
- **Roving tabindex** for grids, toolbars, menus — Tab moves into/out of the group; arrows navigate within.

## Micro-interaction physics

When motion is present, get the physics right or skip it:

| Interaction | Duration | Easing |
|-------------|----------|--------|
| **Hover** | 100-150ms | ease-out |
| **Press / release** | 80-120ms | ease-in-out |
| **Modal / drawer open** | 200-280ms | ease-out (decelerate into rest) |
| **Modal / drawer close** | 160-200ms | ease-in (accelerate out) |
| **Page transition** | 240-320ms | ease-in-out |
| **Color shift / theme** | 200-300ms | ease-out |

The defaults that exist in CSS (`linear`, `ease`) almost always feel mechanical. Use cubic-bezier or named curves with intent.

Three named curves worth knowing:
- `cubic-bezier(0.4, 0, 0.2, 1)` — Material standard, balanced
- `cubic-bezier(0.32, 0.72, 0, 1)` — confident exit (good for closing)
- `cubic-bezier(0.16, 1, 0.3, 1)` — soft enter (good for opening)

Respect `prefers-reduced-motion`. Wrap any non-essential motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Affordance audit

For each interactive element, verify:
- It looks clickable (cursor, hover state, button shape, link underline) — or it's been deliberately styled as a non-interactive disclosure
- The hit area matches the visual area
- The action it performs is communicable in 3 words
- Reversible actions are easy to reverse (undo, cancel)
- Destructive actions require confirmation OR support undo (not both, that's annoying)

Common affordance failures:
- Clickable images with no cursor change
- Links that look like buttons but aren't, or buttons that look like links
- "Cards" that are sometimes clickable, sometimes not, with no visual difference
- Icon-only controls without tooltips or `aria-label`

## Responsive breakpoints

Common breakpoint set:

```css
/* Mobile-first, max-width queries are usually wrong */
@media (min-width: 640px)  { /* sm */ }
@media (min-width: 768px)  { /* md, tablet */ }
@media (min-width: 1024px) { /* lg, desktop */ }
@media (min-width: 1280px) { /* xl, wide */ }
```

For each breakpoint, verify:
- No horizontal scroll
- Text doesn't overflow containers
- Touch targets ≥ 44px on touch breakpoints
- Layout makes sense (not just a squished desktop)
- Modals fit (or become full-screen sheets on mobile)

The most common responsive bug: fixed-width content (a 600px embed) inside a percentage-width container, breaking out at small widths. Audit for this.

## Information density vs. clarity

There is a tension between density (show more) and clarity (show less). Polish picks the right side per surface:

- **Marketing**: clarity wins. One thing per screen.
- **Dashboards**: density wins, but every visible item earns its place.
- **Forms**: clarity wins on input, density wins on review/summary.
- **Lists / tables**: density wins, with summary above.
- **Settings**: clarity wins; group related items, generous space.

The mistake: applying marketing-spacing to a dashboard, or dashboard-density to a marketing page.

## Polish quality gates

Before declaring an interface polished, run this checklist:

- [ ] Every interactive element has hover, focus, active, and disabled states
- [ ] Every async action has loading + success + error states
- [ ] Every list / data view has empty (first-time, cleared, filtered) states
- [ ] Every modal has focus trap, escape close, click-outside dismiss (or deliberately not)
- [ ] Every form preserves user input on error
- [ ] Every action gives feedback within 100ms (visual change), 400ms (loading state), or both
- [ ] Tab order is logical, focus is always visible
- [ ] Touch targets ≥ 44×44px
- [ ] Works at 320px wide (smallest realistic phone)
- [ ] Works at 1920px wide without empty wastelands of whitespace
- [ ] Respects `prefers-reduced-motion`
- [ ] Respects `prefers-color-scheme` if dark mode is offered
- [ ] No horizontal scroll at any breakpoint
- [ ] All copy is real (no Lorem ipsum, no "Title goes here")
- [ ] All icons have accessible names (`aria-label` or visible text)
- [ ] All form inputs have associated labels (not just placeholders)
- [ ] Color is not the only way to communicate state (status, errors)

## Anti-patterns

- **Animation as polish substitute.** Adding motion to a broken state matrix doesn't fix it. Cover the states first; add motion only after.
- **Skeleton on every load.** Sub-150ms loads should show no indicator at all. The flicker feels worse than nothing.
- **Disabled buttons without explanation.** A grayed-out submit button with no clue why is hostile.
- **Toast for everything.** Toasts are for confirmations of background actions. Use inline feedback for actions the user is currently performing.
- **Inconsistent error treatment.** Some errors as toasts, some as banners, some as inline — pick a system.
- **Modal tabindex traps that don't restore focus.** When the modal closes, focus jumps to the page top. The user is lost.
- **Hover-only affordances.** "Click here on hover" doesn't exist on touch. Whatever appears on hover must also be reachable some other way.
- **Pixel-perfect at one breakpoint, broken at others.** Polish ≠ designing for one screen size.
- **Fading/sliding everything.** Motion that fights the user (slow modals, lethargic transitions) is worse than no motion.

## Output for the user

When this skill is active, the work product is a list of polish-passes, each with:
- The element / state being polished
- The change being made
- Why (which state matrix gap or quality gate it closes)

Do not deliver "I polished the UI." Deliver an itemized list of what was missing and what is now covered.
