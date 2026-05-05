---
name: smart-planner
description: Auto-generates structured plan and todo lists with checkboxes when users ask to build complex things. Analyzes user intent and creates professional, detailed, actionable plans. Activated automatically for any build/create/implement/design request.
---

# Smart Planner — Auto Plan & Todo Generation

This skill activates automatically when the user asks to **build**, **create**, **implement**, **design**, **fix**, **refactor**, or perform any multi-step task. Generate a professional plan before executing.

## When to Activate

Activate for ANY request that involves:
- Building a new feature, app, page, component, or system
- Implementing a multi-step change across files
- Designing a complex UI with multiple sections or screens
- Refactoring or restructuring significant code
- Fixing bugs that require investigation across multiple files
- Any task that will take more than 2-3 steps to complete

Do NOT activate for: single-line fixes, simple factual questions, one-sentence changes.

## Plan Generation Rules

### Analyze First
Before generating the plan, silently analyze:
1. **Goal** — What is the user ultimately trying to achieve?
2. **Scope** — How many files, components, or systems are involved?
3. **Complexity** — What are the dependencies and order of operations?
4. **Risks** — What could go wrong? What needs careful handling?

### Plan Structure (emit this before executing)

```
## Plan

**Goal:** [One sentence: what will be built and why it matters]

**Scope:** [Files/components affected] | **Complexity:** [Low/Medium/High]

### Steps

- [ ] **[Phase 1: Discovery/Setup]** — [Concrete action, e.g. "Read existing auth middleware to understand token structure"]
- [ ] **[Phase 2: Core Implementation]** — [Specific work, e.g. "Create UserProfile component with avatar, bio, and settings tabs"]
- [ ] **[Sub-step 2a]** — [If phase has sub-tasks, indent with 2 spaces]
  - [ ] [Sub-task detail]
  - [ ] [Sub-task detail]
- [ ] **[Phase 3: Integration]** — [How it connects to existing code]
- [ ] **[Phase 4: Validation]** — [Tests, manual checks, or verification steps]
- [ ] **[Phase 5: Cleanup]** — [Remove debug code, update docs, etc. — only if needed]

### Assumptions
- [Key assumption that drives architectural choice]
- [Another assumption — note if user should verify]

### Risk Flags
- ⚠️ [Anything that could break existing functionality]
- ⚠️ [Dependency or edge case to watch for]
```

## Format Requirements

**Granularity rules:**
- Each step should be one atomic, verifiable action
- Steps that take >30 minutes of work get broken into sub-steps
- Use **bold** for phase names — they orient the reader quickly
- 4–12 steps is the right range; fewer is too vague, more is overwhelming

**Checkbox discipline:**
- Every step MUST have a `- [ ]` checkbox
- Never use bullet points (`-`) without checkboxes for plan items
- Sub-steps use indented `  - [ ]` (2-space indent)

**Content quality:**
- Step text must be SPECIFIC to the user's request — not generic
- Include the actual file names, component names, function names from the user's context
- "Create Hero section" is bad. "Create `HeroSection.tsx` with headline, sub-headline, and two CTAs matching the Linear design system palette" is good.
- Assumptions and Risk Flags are optional but use them for complex/ambiguous tasks

## Real Examples

### Example: "Build a habit tracker app with 6 screens"

```
## Plan

**Goal:** Build a clickable 6-screen habit tracker prototype with navigation, charts, streaks, and settings.

**Scope:** Single HTML file with JS navigation | **Complexity:** High

### Steps

- [ ] **Architecture** — Define 6 screen IDs: home, add-habit, detail, analytics, settings, onboarding
- [ ] **Data Layer** — Create in-memory habit store with sample data: 6 habits, 30-day streak history, completion rates
- [ ] **Screen: Onboarding** — 3-step onboarding flow with progress dots and "Get Started" CTA
- [ ] **Screen: Home (Dashboard)** — Today's habits list with completion checkboxes, streak flame icon, progress ring
  - [ ] Habit cards with category icon, name, current streak, check-off button
  - [ ] Top bar: greeting, date, overall completion percentage
- [ ] **Screen: Add Habit** — Form with name, category picker (emoji), frequency selector, color tag
- [ ] **Screen: Detail View** — Habit detail with 4-week calendar heatmap, stats row, edit/delete actions
- [ ] **Screen: Analytics** — Bar chart (weekly completions), streak leaderboard, completion rate by category
- [ ] **Screen: Settings** — Toggle list for notifications, theme, data export button, account section
- [ ] **Navigation** — Bottom tab bar (5 tabs), back arrows on detail screens, all transitions functional
- [ ] **Polish** — Mobile device frame, status bar, smooth transitions, consistent design system tokens

### Assumptions
- Single-file HTML output with embedded CSS and JS
- Sample data pre-populated (no backend or local storage needed for prototype)

### Risk Flags
- ⚠️ Chart rendering: use CSS-only bars or inline SVG to avoid external dependencies
```

### Example: "Fix the login bug where tokens expire too early"

```
## Plan

**Goal:** Find and fix the token expiry logic causing premature logout.

**Scope:** auth middleware, token utils, possibly session config | **Complexity:** Medium

### Steps

- [ ] **Reproduce** — Read auth middleware to identify the expiry check code path
- [ ] **Root Cause** — Check if expiry compares `<` vs `<=`, uses wrong time unit (ms vs s), or ignores refresh window
- [ ] **Fix** — Apply minimal targeted fix to the identified line(s)
- [ ] **Validate** — Trace the fix through the login flow to confirm tokens will last the correct duration
- [ ] **Regression Check** — Ensure logout-on-expiry still works for genuinely expired tokens

### Risk Flags
- ⚠️ Do not change token generation — only the validation logic
```

## After the Plan

Execute immediately after emitting the plan. Do not wait for user confirmation unless:
- A Risk Flag is critical (data loss, breaking production)
- An assumption is clearly wrong and needs clarification
- The user explicitly said "show me the plan first"

As you complete each step, optionally mark it done inline:
- `- [x] **Architecture** — ✓ Defined 6 screen IDs`

This gives the user visibility into progress during long tasks.
