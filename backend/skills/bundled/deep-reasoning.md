---
name: deep-reasoning
description: Use this skill for any non-trivial decision, ambiguous request, architectural choice, or task with hidden complexity. Triggers when the user asks "should we", "how would you approach", "what's the best way", "is this a good idea", or describes a problem with multiple plausible solutions. Also use BEFORE writing code on tasks that touch shared state, security boundaries, performance hot paths, public APIs, or anything labeled "refactor", "migration", or "optimization". Skip only for one-line lookups, pure code formatting, or tasks where the answer is mechanical.
---

# Deep Reasoning

Structured thinking for any task where the wrong direction costs more than the wrong implementation.

## When to engage

Triggers (any one):
- Multiple plausible solutions exist and the tradeoff is non-obvious
- The task touches shared state, security, performance hot paths, or public contracts
- The user's request has more than one reasonable interpretation
- Cost of a wrong direction > cost of one extra reasoning pass
- You catch yourself about to assume something material

Skip:
- Mechanical edits (rename, format, simple typo)
- Lookups with one right answer
- The user has already decided and asked for execution

## Six-stage protocol

Run all six in order. Skip nothing. Each stage produces a written artifact in your reply or scratch — not just internal thought.

### Stage 1 — Restate

Before reasoning about a task, restate it in your own words. Two outputs:

1. **Goal in one sentence**: What outcome makes the task done?
2. **Non-goals**: What is explicitly out of scope? Name 1-3.

If you cannot write one sentence, the task is under-specified. Ask before continuing.

### Stage 2 — Surface assumptions

List every assumption you would otherwise make silently. Format:

```
Assumption: [statement]
Source: [where it came from — code I read / user said / I'm guessing]
Risk if wrong: [what breaks]
```

Three categories to scan:

- **Domain**: meaning of terms, business rules, user expectations
- **Technical**: framework behavior, API contracts, performance characteristics
- **Scope**: what's included, what's excluded, what's existing vs new

A good Stage 2 list has 3-7 entries. Less means you're not looking. More means you're padding — collapse related ones.

If any assumption is high-risk-if-wrong AND low-cost-to-verify, verify it before continuing.

### Stage 3 — Enumerate options

Generate at minimum **three** distinct approaches before evaluating any. Strict rule: enumerate before evaluating. Mixing the steps biases toward the first option.

For each option, capture:

```
Option N: [name]
Mechanism: [how it works in 1-2 sentences]
Why this could be right: [the case for it]
```

Patterns to force breadth:
- The minimal change (smallest diff that solves the stated problem)
- The conventional change (what a textbook would say)
- The structural change (different shape entirely)
- Do nothing / defer (always a real option)

If all three options reduce to the same shape, you haven't enumerated — you've described one option three ways. Try harder.

### Stage 4 — Counterfactual stress test

For each option, write the case AGAINST it. Specifically:

- **What breaks first?** Concrete failure mode, not "complexity"
- **What scale does it stop working at?** 10x users, 100x data, 5 years from now
- **Who pays the maintenance cost?** Future-you, on-call, the next team
- **What's the worst-case rollback?** If we do this and it's wrong, what's the unwind?

A failure mode is concrete only if you can name the symptom (error message, latency number, business metric). "It might not scale" is not concrete. "p99 latency exceeds 200ms once the index passes 50M rows because the seq scan dominates" is concrete.

### Stage 5 — Decision matrix

Score each option on a small set of weighted axes. Keep the matrix tight — 4-6 axes max. Common axes:

| Axis | Meaning | Typical weight |
|------|---------|---------------|
| Correctness | Does it actually solve the goal | 3x |
| Reversibility | Can we undo it cheaply | 2x |
| Blast radius | If wrong, how much breaks | 2x |
| Cost now | Engineering time to ship | 1x |
| Cost later | Ongoing maintenance load | 1x |
| Fit | Matches existing patterns | 1x |

Format:

```
              | Opt A | Opt B | Opt C
Correctness*3 |   3*3 |   2*3 |   3*3   = 9 | 6 | 9
Reversibility*2| 2*2 |   3*2 |   1*2   = 4 | 6 | 2
…
Total         |    13 |    12 |    11
```

If two options tie within 10%, the matrix isn't deciding — pick on a single tiebreaker axis explicitly named.

### Stage 6 — Kill criteria + decision

State explicitly:

1. **Decision**: Which option, in one sentence
2. **Why this and not the runner-up**: One sentence of the deciding factor
3. **Kill criteria**: What signal would make us reverse this decision? Named metrics or events, not vibes
4. **Open questions**: What we still don't know that could change the call

Kill criteria is the single most-skipped step. Without it, sunk-cost fallacy compounds. Concrete examples:
- "Reverse if p99 query latency > 80ms after rollout"
- "Reverse if more than 2 customers report breakage in 7 days"
- "Reverse if review velocity drops below 3 PRs/day"

## Second-order effects checklist

Before declaring a decision final, run this scan. Each "yes" is a thing to think through.

- [ ] Does this change a public contract (API, schema, URL, env var)?
- [ ] Does this change observable behavior at runtime?
- [ ] Does this change error messages or logs that something else parses?
- [ ] Does this affect concurrency, ordering, or transaction boundaries?
- [ ] Does this change data shape stored at rest?
- [ ] Does this change permissions, auth, or trust boundaries?
- [ ] Does this change which code paths run for which users?
- [ ] Could this surface new attack surface (injection, IDOR, SSRF, deserialize)?
- [ ] Does this affect billing, metering, or quotas?
- [ ] Does this affect observability — what oncall sees during an incident?

If 3+ checks are yes, the change is meaningfully cross-cutting. Plan rollout in stages and document the migration path.

## Common reasoning failure modes

Watch for these. They are the source of most bad decisions:

1. **Anchoring on first option** — You enumerated to satisfy the rule, but you'd already decided. Symptom: the case-against for option 1 is short and weak.

2. **False trichotomy** — Three "options" are really three flavors of the same shape. Symptom: they all touch the same files and have the same blast radius.

3. **Optimizing the wrong axis** — You scored on "elegance" or "simplicity" without naming what they buy you. Symptom: the winner is the one you find prettiest, not the one that makes the system safer.

4. **Ignoring do-nothing** — The default option is always available. Symptom: no row in your matrix represents "we don't do this and accept the cost."

5. **Decision without kill criteria** — Future-you cannot tell whether the bet paid off. Symptom: success metrics are absent or hand-wavy.

6. **Reasoning theater** — Long Stage 1-5 ritual, no real change to what you would have done anyway. Symptom: the decision is identical to your gut, your gut wasn't checked. Fix: actually update from the analysis, or admit you're rationalizing and ship.

## Compressed mode

For tasks that need structure but not the full ritual, run a 4-line version:

```
Goal:        [one sentence]
Assumption:  [the most load-bearing one — verify if cheap]
Picked:      [chosen approach + why over runner-up]
Kill if:     [signal that means reverse]
```

Use compressed mode when the task is medium-stakes, ~30 min of work, or when the user is moving fast. Full protocol is for changes you'd lose sleep over getting wrong.

## Output for the user

When this skill is active, your reply to the user should make the reasoning visible without burying the answer. Two acceptable shapes:

**Shape A — Decision-first**: Lead with the decision, then 3-5 lines of why, then offer to expand on any stage.

**Shape B — Fork-in-the-road**: When you genuinely cannot decide for the user, present the 2-3 viable options with their decisive tradeoff. Do not list every consideration. Pick the one that decides the call.

Either shape, never deliver a 6-stage essay unless the user explicitly asks for the full reasoning trace.

## Anti-patterns

- **Pretending to enumerate** — listing options you've already rejected to make the chosen option look stronger
- **Counterfactual without specifics** — "this might be slow" instead of "this is O(n²) on the request path with n in the thousands"
- **Decision matrix with one axis** — that's not a matrix, that's an opinion in a table
- **Kill criteria written as future homework** — "we'll add monitoring later." If you can't define the signal now, you can't reverse the decision later.
- **Reasoning that confirms what you wanted to do** — if every assumption breaks in the same direction (toward your preferred option), you're not reasoning, you're advocating
