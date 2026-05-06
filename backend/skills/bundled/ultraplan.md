---
name: ultraplan
description: Use this skill BEFORE implementing any non-trivial change — features, refactors, migrations, infrastructure work, anything spanning multiple files or commits. Triggers on "plan this", "how would you approach X", "design a plan for", "break this down", "what are the steps", or any task estimated >2 hours of work. Produces a phase-decomposed implementation plan with risk register, dependency graph, validation gates, rollback strategy, and stop-tripwires. Do NOT use for one-line edits, simple bug fixes (use bughunter), or pure exploratory questions (use deep-reasoning).
---

# UltraPlan

Execution-ready plans for non-trivial work. Each plan answers: what gets done in what order, what could go wrong, how do we know it worked, and how do we back out if it didn't.

## When a plan earns its weight

Use full UltraPlan when at least one is true:
- Touches more than 3 files or 2 commits of work
- Touches shared state, public contracts, data at rest, or auth boundaries
- Migration, refactor, or infrastructure change
- Estimated >2 hours of focused work
- Reversibility cost is high (deployed code, run migrations, sent emails)

For smaller work, use the **compact form** at the bottom of this file.

## The seven required sections

Every UltraPlan output contains these in order. Skip none. If a section is genuinely empty, write "None — [reason]" instead of deleting it.

```
1. Goal & Non-Goals
2. Assumptions & Constraints
3. Phase Decomposition
4. Risk Register
5. Validation Gates
6. Rollback Strategy
7. Stop Tripwires
```

### 1. Goal & Non-Goals

**Goal**: One sentence. The state of the world after this plan succeeds. No "improve" or "make better" verbs — name the observable change.

Bad: "Improve checkout reliability."
Good: "Reduce checkout failure rate from 1.4% to <0.3% on the /checkout endpoint, measured over 7 rolling days."

**Non-goals**: 2-5 bullets of what is *not* being changed. The point is to prevent scope creep mid-execution. Be aggressive — the more you exclude, the easier the plan ships.

Concrete examples:
- "Not in scope: refactoring the cart-totals calculator (separate ticket)"
- "Not changing: the Stripe integration layer or any external API contract"
- "Not optimizing: bundle size or page-load (different work stream)"

### 2. Assumptions & Constraints

Two short lists.

**Assumptions** — things you're treating as true. Each item with a verify-cost flag:

```
- [verify-cheap] The `orders.user_id` column has an index. (run \d+ orders to confirm)
- [verify-medium] No production traffic uses the deprecated /v1/charge endpoint. (1 week of access logs)
- [verify-expensive] No third-party library depends on the legacy webhook format. (ask vendors)
- [accept-as-given] The payments team owns the Stripe SDK upgrade timeline.
```

Verify the cheap ones before starting. Note the expensive ones as risk-register entries.

**Constraints** — non-negotiable requirements. Each one shapes the design:

```
- Zero customer-visible downtime
- Cannot exceed 50ms added p99 latency
- Must be reversible within 1 release cycle
- All changes behind feature flag X
- Compliance: no plaintext PII in logs
```

### 3. Phase Decomposition

Break the work into phases. A phase is a *shippable, reversible unit*. Aim for 3-7 phases. Fewer = phases too big to verify; more = micromanaging.

For each phase:

```
Phase N: [name]
Goal: [what state of the world this phase produces]
Changes: [list of files / systems / migrations touched]
Depends on: [previous phases this requires]
Effort: [S / M / L  ≈ <1h / <half-day / <2 days]
Independently shippable: [yes / no — and if no, why]
Verification: [how you'll know this phase landed correctly]
```

Phase ordering principles:

1. **Read before write.** Phases that observe / measure / characterize current behavior come before phases that change it. You cannot tell if you broke something without a baseline.
2. **Reversible before irreversible.** Behind feature flags first; flip the flag only after upstream phases land.
3. **Strangler before kill.** New code path running silently in parallel before old code path retires. Compare outputs before deciding.
4. **Migration shape**: dual-write → backfill → dual-read with new as primary → drop old. Never bundle these into one phase.
5. **Smallest reversible deploy.** Each phase ships independently if possible. Do not chain 5 phases that must all land together.

#### Dependency graph

If the plan has more than ~4 phases, draw the dependency graph. Plain text is fine:

```
P1 → P2 → P3 → P5
       ↘  P4 ↗
```

Phases on the same level can run in parallel. Critical path = the longest chain.

### 4. Risk Register

For each material risk, one row:

```
Risk: [what could go wrong, in concrete terms]
Likelihood: [low / medium / high]
Impact:     [low / medium / high]
Trigger:    [what signal tells us this is happening]
Mitigation: [what we do *before* the risk materializes to lower likelihood/impact]
Response:   [what we do *if* it materializes — concrete steps, not "investigate"]
```

Score = likelihood × impact. Write up at minimum the top 5 by score. If your register has only "low" risks, you're either wrong or the plan is too small for UltraPlan.

Categories to scan when generating the register:

- **Data risks**: corruption, loss, leak, irreversibility of write
- **Behavior risks**: regression, perf cliff, unintended path, cache stampede
- **Operational risks**: deploy fails, rollback fails, on-call lacks runbook
- **People risks**: handoff in middle, dependent team blocks, knowledge in one head
- **External risks**: vendor outage, rate limit, dependency upgrade breaks
- **Adoption risks**: change ships but no one uses it; or everyone uses it wrong

### 5. Validation Gates

For each phase, name the **objective signal** that tells you it succeeded. Subjective signals ("looks good") are not gates.

A gate is one of:

- A test that passes (specific test name)
- A metric that meets a threshold (named metric, named threshold, named time window)
- A query that returns a specific result
- An external system confirming a state (Stripe webhook received, message acked)
- A manual checkpoint with a named owner and explicit done criteria

Format:

```
Phase 2 gate:
  - tests/orders/dual_write_test.py::test_dual_write_consistency passes (CI)
  - dual-write divergence rate metric < 0.01% for 24h (Datadog: orders.dual_write.divergence)
  - manual: payments-team review of 50 sampled diffs, signed off in #payments-eng
```

If you cannot name a gate, the phase is not done — it's "shipped and hoping." Define the gate before starting the phase.

### 6. Rollback Strategy

For each phase, document:

```
Rollback trigger: [which tripwire calls for rollback]
Rollback action: [exact steps — feature flag flip, git revert, db restore from snapshot, etc.]
Rollback window: [how long we have before rollback becomes expensive — minutes / hours / days]
Data implications: [what happens to data written during the bad phase — discarded? backfilled? reconciled?]
```

Three rollback shapes by phase type:

- **Feature flag flip** — fastest, ~seconds. Default for all behavior changes.
- **Code revert** — minutes. Requires a clean revert point, no follow-up commits depending on the bad change.
- **Data rollback** — slowest, often impossible. For migrations: write the inverse migration before shipping the forward one. If inverse is impossible (data lost), the migration must be staged with explicit checkpoints and snapshots.

Forward-only changes (events sent, emails delivered, payments processed) cannot be rolled back. Treat these as the irreversibility line — they earn their own gate before the change ships.

### 7. Stop Tripwires

Before starting, define the conditions under which you halt and replan. These are *not* the same as risks — they're the bright-line signals that the plan is wrong, not just hitting a known risk.

Each tripwire:

```
If: [observable condition]
Then: [pause the work, name who decides whether to continue]
```

Examples:

```
If: Phase-2 dual-write divergence > 0.5% sustained for 1h
Then: Pause rollout. Payments lead + on-call decide whether root-cause is fixable or plan needs revision.

If: Plan estimate slips >50% on phase-1 effort
Then: Stop. Either the plan was wrong or the phase decomposition was wrong. Re-estimate.

If: Any P0 from code-review on phase changes
Then: Halt phase. P0 fix is prerequisite — do not stack work on top of unresolved P0.

If: Discovered a constraint not listed in section 2
Then: Stop and update the plan. Constraints discovered late invalidate the design.
```

The tripwire that's almost always missing: **"if estimates slip by X%, stop."** Without it, sunk-cost compounds.

## Phase decomposition patterns

Some work shapes have proven decompositions. Use these as templates.

### Pattern A — New feature behind a flag

1. Schema/contract changes (additive only, backward compatible)
2. Implementation of new code path, behind flag, defaulting off
3. Internal-only flag enable, dogfood + smoke test
4. Gradual rollout (1% → 10% → 50% → 100%) with metric gates between
5. Flag removal after stabilization period

### Pattern B — Refactor without behavior change

1. Characterize current behavior with golden tests (capture, don't change)
2. Introduce new structure alongside old, both running
3. Switch consumers to new structure
4. Delete old structure

### Pattern C — Schema migration (column add)

1. Add column nullable / with default. Deploy.
2. Backfill historic rows in batches. Monitor for completion.
3. Update writes to populate the column. Deploy.
4. Update reads to use the column when present. Deploy.
5. Make column NOT NULL once all writes populate. Deploy.

### Pattern D — Schema migration (column remove)

1. Stop reading from column. Deploy. Verify zero reads.
2. Stop writing to column. Deploy. Verify zero writes.
3. Drop column once monitoring period passes (1+ week typical).

Never try to do steps 1-3 in one go. The column outlives the code by design — that's the safety mechanism.

### Pattern E — Replacing an external dependency

1. Adapter layer in front of current dep
2. Implement adapter for new dep
3. Dual-call (call both, compare results offline) for a period
4. Promote new dep to primary, old to fallback
5. Remove old dep when fallback hasn't fired in N days

### Pattern F — Performance optimization on hot path

1. Establish baseline (named metric, named percentile, named time window)
2. Add observability for the suspected bottleneck (pre-fix)
3. Implement optimization behind flag
4. A/B with flag, compare baseline to variant — must show *named* improvement
5. Roll out if gain > threshold; revert and rethink otherwise

## Estimate hygiene

For each phase, estimate using planning poker shape:

| Size | ≈ Solo eng time | Use when |
|------|----------------|----------|
| XS | <30 min | one obvious change, no review needed |
| S | 1-2 h | small change, single-file scope |
| M | half-day | spans 2-5 files, includes tests |
| L | 1-2 days | multi-system, includes review cycle |
| XL | >2 days | should probably be split |

If any phase is XL, split it. XL = "I haven't designed this phase yet."

Multiply solo estimates by ~1.5 for first-time work in unfamiliar code, 2x for cross-team coordination, 3x for "depends on something external."

## Anti-patterns

- **Plan as wishlist.** A plan that's just bullets without ordering, dependencies, or verification is a wishlist.
- **All-or-nothing rollout.** Phases that must all land together = no rollback granularity = high blast radius.
- **Validation gates as TODO.** "We'll add metrics later" — you won't, and you'll ship blind.
- **Risk register full of low-likelihood, low-impact items.** Padding. Real plans surface the 2-3 things that actually scare you.
- **No tripwires.** Plan that can only succeed assumes nothing surprising happens. Plans without escape hatches turn into death marches.
- **Phases that aren't reversible.** "Phase 1: drop the old table." That's not a phase, that's a one-way door.
- **Estimating without splitting.** "Whole feature: 2 weeks." Useless. Per-phase or it's not an estimate.
- **Plan written *after* coding starts.** The plan is supposed to shape the code. If the code shapes the plan, you've documented your decisions, not made them.

## Compact form (for medium work)

When a full UltraPlan is overkill but a 1-line "I'll do X" isn't enough:

```
Goal:        [observable outcome]
Phases:      [P1: ... → P2: ... → P3: ...]
Top risk:    [the one thing that could blow this up + mitigation]
Validation:  [the signal that says it worked]
Rollback:    [how to back out if it doesn't]
Tripwire:    [stop condition]
```

Six lines. Use this for half-day to one-day work.

## Output format

A real UltraPlan is a markdown document, not a chat reply. Render the seven sections with headers. The user should be able to paste it into a doc, share it with a teammate, and have them execute against it.

If the plan is large, end with a one-paragraph **executive summary** at the top — the goal, the shape (number of phases, expected total effort), and the single biggest risk. Some readers will only read that paragraph. Make it stand alone.
