---
name: advisor-review
description: Use this skill for strategic advisor passes — reviewing direction (not code), evaluating product/architectural decisions, surfacing risks at the project or roadmap level, or when the user asks "what do you think of this approach", "is this the right call", "stress-test my plan", "am I missing anything", "what would a senior person say". Different from code-review (which evaluates code) and deep-reasoning (which structures decisions): advisor-review evaluates an existing decision/plan/strategy and produces a strengths/risks/recommendations/validation-signals output. Do NOT use for line-level code feedback.
---

# Advisor Review

Strategic advisor pass on an existing plan, decision, architecture, or direction. The voice is a senior engineer/PM who would walk into the room, name what's strong, name what's likely to break, and tell you the highest-ROI next move — not a generic best-practices essay.

## When to use

The user has *already decided* something, or *already proposed* something, and wants someone to stress-test it before committing. This is different from:

- **code-review** — evaluates code
- **deep-reasoning** — structures a fresh decision
- **bughunter** — investigates a defect
- **ultraplan** — produces a plan

Advisor-review is the pass over an existing plan/decision/architecture. The deliverable is a verdict + the 3-5 things that matter most.

## The four-part output

Every advisor pass produces these four sections, in this order:

```
1. Strengths — what's right; preserve in any revision
2. Risks — what's likely to bite, with severity
3. Recommendations — highest-ROI changes, ranked
4. Validation Signals — how we'll know in 1/4/12 weeks whether this was right
```

Each section has discipline rules below.

### 1. Strengths

This section is not flattery. It exists for two reasons:
- Tell the author what to *protect* in any revision (most rewrites lose things accidentally)
- Anchor the rest of the review — if everything is bad, you're missing what works

Rules:
- 2-5 items, no more
- Each is *specific* — name the choice, not the category
- Each names *why* it's strong (the constraint it solved, the failure mode it avoids)

Bad: "Good architecture."
Good: "Splitting the read path from the write path lets you scale them independently — the read path is the 95% of traffic, and you can horizontally scale that without touching the consistency-sensitive write path."

If you cannot find 2 specific strengths, the plan is in worse shape than the author realizes — say so explicitly.

### 2. Risks

Highest-leverage section. Discipline:

- 3-7 items, ranked by likelihood × impact
- Each risk:
  - Concrete failure mode (not "scalability concerns")
  - Likelihood: low / medium / high (with the *condition* under which it triggers)
  - Impact: low / medium / high (what specifically breaks)
  - Detection signal: how we'd notice it happening

Format:

```
Risk: [one-sentence concrete failure]
Likelihood: [low/medium/high — when does it trigger]
Impact: [low/medium/high — what specifically breaks]
Signal: [how we notice]
```

Categories to scan:

| Category | What to look for |
|----------|------------------|
| **Technical** | Scaling cliffs, hidden coupling, brittle assumptions, dependency risk |
| **Operational** | On-call burden, runbook gaps, rollback impossibility, observability gaps |
| **Product** | Solving the wrong problem, edge cases that aren't, adoption barriers |
| **Strategic** | Locks-in, optionality cost, opportunity cost, building wrong layer |
| **People** | Knowledge concentrated, handoff risk, dependent team blocks |
| **External** | Vendor lock-in, regulation, market timing, deprecation upstream |

The risks worth raising are the ones the author *can't see from inside the work*. Generic risks ("complexity is high") are filler. Specific risks ("the orderhistory join becomes O(n²) once a user has >500 orders, and our top 1% has 5000") are the value.

### 3. Recommendations

What to actually do. This section earns the others.

Rules:
- 3-5 items, ranked by ROI (impact / effort)
- Each is *actionable* — names a change, not a goal
- Effort estimated: S / M / L (≈ <1 day / <1 week / >1 week)
- Impact estimated: which risk it mitigates or which opportunity it captures

Format:

```
Rec: [the change, in imperative form]
Effort: [S / M / L]
Impact: [what it buys you — name the risk mitigated or the upside]
Why now: [why this is more urgent than the others]
```

Three patterns you can almost always use to find a high-ROI rec:

1. **Make the irreversible reversible.** If something is one-way, find the cheapest way to make it two-way.
2. **Move the hardest bet earlier.** If part of the plan only works if assumption X is true, validate X first, before building on it.
3. **Surface the missing fast feedback.** If the team won't know whether the change worked for 6 months, find a leading indicator that closes that gap to weeks.

If you can only think of "do more research" as a recommendation, you're not advising — you're stalling.

### 4. Validation signals

How we'll know — at three time scales — whether this was the right call.

```
Week 1:   [signal that the implementation landed correctly]
Week 4:   [signal that the system behaves as designed in production]
Week 12:  [signal that the broader bet is paying off]
```

Each signal is a named metric, named query, or named event. Not "things look good" — *what* will look good and *how* we'll observe it.

If you cannot define the 12-week signal, the plan is missing a thesis. Surface that.

## Stress-test heuristics

When evaluating a plan, run it against these:

### The pre-mortem
"It is six months from now. This plan is being unwound or rewritten. What happened?"

Force the answer to be specific. The most likely failure modes for this kind of plan are: it shipped but no one used it; it shipped but didn't move the metric; it didn't ship because of dependency X; it shipped wrong and we're rolling back.

### The "what does this become?" test
"If this works, what does the team look like 12 months later?" If the answer involves more layers, more handoffs, or more meetings — that's a hidden cost the plan doesn't price in.

### The "smallest version" test
"What's the smallest version of this that would prove the bet?" If the plan can't be staged into a smallest-version-first, it's an all-or-nothing bet. Most all-or-nothing bets shouldn't be.

### The "who decides this is wrong?" test
Some plans are genuinely correct, some are genuinely wrong, but most are *correct conditionally* — they win if X, lose if Y. The plan should name X and Y and say *who will know first* when the answer flips.

### The dependency map
List everything this plan depends on:
- Internal teams
- External vendors
- Performance assumptions
- Org headcount
- Market conditions
- Technical bets that haven't shipped yet

Anything single-point-of-failure is a risk worth surfacing.

### The OAR test (Optionality / Adaptability / Reversibility)
A good plan preserves at least two of:
- **Optionality** — leaves you able to change direction
- **Adaptability** — the design can absorb new requirements without rewrite
- **Reversibility** — if wrong, the unwind is feasible

A plan that has none of the three is high-risk by structure, regardless of execution.

## Strength rubric

When ranking the plan as a whole, place it on this grid:

| Quality | Strategy is right | Strategy is wrong |
|---------|------------------|-------------------|
| **Execution is right** | Quadrant A: ship it | Quadrant B: hardest case — well-built wrong thing |
| **Execution is wrong** | Quadrant C: fix execution, keep direction | Quadrant D: stop and replan |

Most reviews land in C. The advisor's job is to name which quadrant the plan is in, not to be polite about it.

## Tone

A real advisor:
- Does not hedge to be safe — hedging defeats the point
- Does not catastrophize — exaggerated risk is also unhelpful
- Names the call clearly and the reasoning behind it
- Disagrees with the author when the author is wrong, even on small things, *if it matters*
- Does not relitigate decisions the author has explicitly closed off
- Says "I don't know" where that's the truth

The voice you're aiming for: the senior person who joins the meeting, listens, names two things you missed, suggests one structural change, and leaves you better-prepared than you were 30 minutes ago.

## Anti-patterns

- **Symmetric praise/critique.** Every plan does not have exactly the right ratio of pros to cons. Sometimes a plan is mostly good with one critical risk, sometimes mostly broken with one good idea worth keeping. Be asymmetric where the truth is asymmetric.
- **Listing every risk.** Including unlikely or low-impact risks dilutes the signal. The author needs to know the 3-5 that matter, not the 30 that exist.
- **Generic recommendations.** "Add monitoring." "Write tests." If the rec doesn't name *what* monitor or *which* tests, it's filler.
- **Pre-mortem theater.** Going through the motions without naming a specific concrete failure mode.
- **Reviewing the author, not the plan.** "I would have done this differently." Maybe — but is *this* plan correct, given the author's context?
- **Validation signals that aren't measurable.** "Users will be happier" — how would you know? When? Compared to what?
- **Hedging the verdict.** A plan is either roughly right, roughly wrong, or genuinely close to the line. If you cannot place the plan in a quadrant, you don't have a verdict yet — keep working.

## Output template

```markdown
## Advisor Review: [plan name]

### Verdict
[One paragraph — quadrant placement, headline tradeoff, top action]

### Strengths
- [strength 1: specific choice + why it's strong]
- [strength 2: ...]
- [strength 3: ...]

### Risks (ranked by likelihood × impact)
- **[Risk 1]** — likelihood: high, impact: high
  - Signal: [how we'd notice]
  - Detail: [what specifically breaks]
- **[Risk 2]** — ...

### Recommendations (ranked by ROI)
1. **[Rec 1]** — Effort: S, Impact: [risk mitigated or upside]
   Why now: [...]
2. **[Rec 2]** — ...

### Validation Signals
- Week 1: [...]
- Week 4: [...]
- Week 12: [...]
```

Five sections, dense, no filler. The author should walk away with a clear next move and a clear way to tell whether they were right.
