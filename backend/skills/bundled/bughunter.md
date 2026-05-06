---
name: bughunter
description: Use this skill for any defect investigation — "there's a bug", "this is broken", "X stopped working", "intermittent", "flaky", "sometimes fails", "wrong output", "crash", "regression", "works locally but not in prod". Triggers on stack traces, error messages, repro reports, or any "why is this happening" question. Drives a reproduction-first, hypothesis-disciplined methodology with explicit root-cause taxonomy. Do NOT use for greenfield design or for review of working code — only for live defects.
---

# BugHunter

Reproduction-first defect investigation. Hypothesis discipline. Smallest safe fix. Regression test that would have caught the original bug.

## The five-phase loop

Run these in order. Skipping ahead is the most common reason debugging takes 10x longer than it should.

```
1. Reproduce  →  2. Localize  →  3. Hypothesize  →  4. Fix  →  5. Verify + lock
```

Each phase has an exit gate. Do not advance without it.

### Phase 1 — Reproduce

**Exit gate**: You can trigger the bug on demand, or you can describe a deterministic signal that proves the bug occurred.

Goal: cheapest, fastest, most reliable repro. Without one, every "fix" is a guess.

Steps:

1. Capture the **observed behavior** in writing. Specifically: what input, what output, what was expected. If the user said "it's broken" — push back until you have all three.
2. Capture the **environment**: OS, runtime version, browser, dependency versions, env flags, time of day if relevant, whether it happens locally / staging / prod / all.
3. Build the **shortest repro** — fewest steps, smallest input, least state. Strip everything that doesn't change the outcome.
4. Decide the **repro signal**:
   - Deterministic: `pytest -k repro_xyz` fails reliably. Best case.
   - Intermittent (~N% of runs): document the rate. Now you have a statistical signal.
   - Production-only: a metric / log line / alert that fires when the bug occurs. Document the exact filter.
5. **Cannot reproduce?** Don't fix. Three responses:
   - Add observability and wait for it to recur (log the suspicious code path with context)
   - Ask the reporter for the missing variable (env, input, sequence)
   - Document the gap and stop. Shipping a "fix" for an unreproduced bug is how you ship two bugs.

**Common Phase-1 failures:**
- Believing the user's diagnosis. They reported the symptom, not the cause.
- Reproducing the wrong bug. Two bugs can present the same symptom — verify the repro produces the *exact* output the user described.
- Skipping environment capture. "Works locally" is information, not a closing argument.

### Phase 2 — Localize

**Exit gate**: You can name the smallest unit (function, line range, query, config value) where the wrong behavior is generated.

Tools, in order of cost:

1. **Stack trace** if there is one. Read top-down. The top frame is where the symptom surfaced; the cause is usually 2-5 frames down where untrusted/unexpected data was accepted.
2. **Diff bisection** when the bug is a regression. `git bisect run` with your repro as the test. This is the single highest-leverage debugging tool — use it whenever the bug worked before some date.
3. **Print/log bisection** in code. Add prints at module boundaries; halve the search space each iteration. Don't pepper logs randomly — pick the midpoint of where you suspect.
4. **Differential**: same input on two systems (working vs broken, same version vs version-with-bug, two users, two regions). The first divergence is the localization.
5. **State-snapshot**: dump every relevant variable at the suspected line. Compare to what it *should* be.

**Localization heuristics:**
- The bug is almost never in the framework. Suspect your code first.
- Recent changes are 10x more likely than ancient code. Check `git log -p path/to/file` for the last week.
- Boundaries (input parsing, type coercion, network I/O, async transitions, cache lookups) are 10x more likely than pure logic.
- If the bug is in a place you "would never" check, that's exactly where to check.

### Phase 3 — Hypothesize

**Exit gate**: You can state, in one sentence, what the bug *is* (not what triggers it). And you've matched it to a known failure mode.

A correct hypothesis has three properties:
1. **Mechanism**: explains the wrong output from the code as written
2. **Predicts**: tells you what other inputs/conditions also fail
3. **Falsifiable**: there's a test that, if it passes, proves the hypothesis wrong

Bad hypothesis: "the cache is acting weird"
Good hypothesis: "the cache key omits user_id, so user A's cached response is served to user B when their request arrives within the 60s TTL"

#### Root-cause taxonomy

When forming a hypothesis, match the symptom to a known class. Most bugs are one of these:

| Class | Signature | Where it lives |
|-------|-----------|---------------|
| **Off-by-one** | wrong count by ±1, missing first/last element, infinite loop on empty | loop bounds, range checks, slice indices |
| **Null/undefined** | crash on access, silent default propagation | optional fields, lazy init, error paths returning None |
| **Type coercion** | `"0" == false` style, `NaN` arithmetic, `parseInt("08")` | language boundaries, JSON, form data, env vars |
| **Race / concurrency** | works in tests, fails under load, intermittent | shared mutable state, async/await without await, missing lock |
| **Time-of-check / time-of-use (TOCTOU)** | check passes then condition changes | auth checks, file existence checks, cache reads |
| **State leak** | first request works, subsequent fail; works alone, breaks in suite | global mutable state, module-level cache, leaking thread-local |
| **Cache invalidation** | stale data after update, intermittent staleness | cache key missing dimension, TTL too long, no invalidation on write |
| **Order-of-operations** | "extra newline", "data ate my zero", "trailing comma" | string formatting, parse-then-validate vs validate-then-parse, transform pipelines |
| **Encoding** | smart quotes, unicode breaks regex, BOM, double-UTF8 | file I/O, copy-paste, multi-language input, terminal vs file |
| **Floating point** | `0.1 + 0.2 != 0.3`, comparison after arithmetic | money in floats, equality check on float, accumulation drift |
| **Timezone / DST** | wrong day at midnight, hour missing in March, doubled hour in November | date arithmetic with naive times, server vs client time |
| **Integer overflow / underflow** | flips sign, wraps to small value | counters, ID arithmetic, time-in-ms-as-int32 |
| **Dependency version skew** | works on dev's machine, breaks on CI | unpinned deps, transitive version conflicts, lockfile out of sync |
| **Missing index / N+1** | works at small scale, dies at production scale | new query path, recently grown table, missing eager-load |
| **Error swallowed** | "it just doesn't work", no log line, no exception | bare `except:`, `try { } catch(e) {}`, promise rejection unawaited |
| **Async ordering** | code runs before its dependency, race in setup | unawaited promise, callback with wrong scope, parallel where serial intended |
| **Config drift** | works one env, fails another | env var with default, missing secret, region-specific config |
| **Deserialization mismatch** | schema-shaped output looks right but values wrong | new field added one side, type changed, optional treated as required |
| **TOC mismatch** | 2 systems disagree on truth | event consumer behind producer, db replica lag, cache vs source |

When you cannot match the bug to one of these, slow down. The bug is probably one of these and you haven't seen it yet — re-read the code with this list in hand.

### Phase 4 — Fix

**Exit gate**: The smallest change that eliminates the root cause without introducing new ones.

Rules:

1. **Fix the cause, not the symptom.** If the bug is "stale cache," do not "clear the cache on every request." Do "include user_id in cache key."
2. **Smallest diff.** A 1-line fix beats a 30-line refactor every time. If you cannot fix in <10 lines, your hypothesis may be wrong — go back to Phase 3.
3. **Do not bundle.** If you noticed two bugs, fix one. Bundling makes both harder to review and harder to revert.
4. **Do not refactor adjacent code.** Even if it's ugly. Even if it's "while you're in there." Adjacent improvements ship in a separate change.
5. **Defensive code is not a fix.** Adding `if (x != null)` to mask a null that shouldn't exist hides the real bug. Find why x was null.
6. **Comment the *why*, not the what.** If the fix is non-obvious — "this looks redundant but isn't because of X" — leave one line of context.

#### Fix smell test

Before claiming the fix is done, score it:

- [ ] Does the fix change the behavior described in the hypothesis?
- [ ] If I revert this fix and run the repro, does the bug come back?
- [ ] If I keep this fix and run *adjacent* tests, do they still pass?
- [ ] Could this fix introduce a new failure mode? (Often: yes — name it, decide if acceptable)
- [ ] Is the fix the smallest one that achieves all of the above?

### Phase 5 — Verify + lock

**Exit gate**: A test exists that fails on the original code and passes on the fixed code. The test would catch this regression class, not just this exact instance.

Steps:

1. **Run the repro** against the fixed code. It must now produce the expected behavior.
2. **Write a regression test.** It should:
   - Fail when applied to the pre-fix code (verify by stashing the fix and running)
   - Pass when applied to the post-fix code
   - Test the *invariant*, not just the example. ("user A and user B get different cache responses" — not just "this exact input passes")
3. **Run adjacent tests.** The full file's test suite, then the directory, then a relevant module. Catch the case where the fix broke something else.
4. **Add observability if intermittent.** If the bug was a race or timing-dependent, ship a metric / log line that would surface a recurrence.
5. **Document.** In the commit message: what the bug was, the root cause class (from the taxonomy), and the failure mode in one sentence. Future-you and on-call will thank you.

## Reproduction techniques by bug class

Some bug classes have specific repro recipes:

- **Race condition**: run the operation in parallel (`asyncio.gather`, threading, k6/locust) at 10-100x concurrency; if it fails ≥ once in 1000 trials, you have it
- **Memory leak**: long-running process under load, observe RSS over hours; or repeat the suspect operation 10k times and watch heap
- **Time-dependent**: `freezegun` / `sinon.useFakeTimers()` / mock clock; test boundary times (00:00:00 UTC, 23:59:59, midnight in user's TZ)
- **Resource exhaustion**: low-FD environment (`ulimit -n 64`), low-memory environment, slow network (`tc qdisc`)
- **Production-only**: shadow traffic, dark launch, dual-write to logging, structured log scraping with the exact predicate

## Anti-patterns

- **Skipping Phase 1.** "I see the bug, I'll just fix it." 50% of the time the fix is wrong because the bug wasn't what you thought.
- **Fixing the first hypothesis without testing it.** Hypothesis is cheap; verifying is also cheap. Verify.
- **Adding `try/except` to hide a crash.** That's not a fix; that's silencing the alarm.
- **Reverting until "it works."** Reverting is fine for triage but it's not a fix — find the cause.
- **Fix without regression test.** The bug will return. Always.
- **"Couldn't reproduce, closing."** If you can't repro AND the user can, that's a Phase-1 failure, not a non-bug. Add observability or get more info.
- **Bug-hunting on a moving target.** Pin the dependency, pin the input, freeze the environment. Investigate against a stable baseline.
- **Going wide before going deep.** Reading the whole codebase before localizing is procrastination. Stack trace → suspect file → suspect function.

## Output for the user

When this skill is active, the reply should land in this shape:

```
Repro: [the minimal trigger you confirmed, or "could not reproduce" with what's needed]
Localized: [file.ext:line — the smallest unit responsible]
Root cause: [hypothesis in one sentence + class from taxonomy, e.g., "race / concurrency"]
Fix: [the change you made or propose, with the smallest diff]
Test: [the regression test name + what invariant it locks]
```

If the bug is unreproduced, stop at "Repro:" and explain what's needed. Don't fabricate the rest.

## Worked example

Report: "Sometimes orders show the wrong customer name in the receipt email."

```
Repro: Could reproduce by issuing two POST /orders in parallel from different users
       within 50ms. The second user's email shows the first user's name ~30% of trials.
       Reliable signal: parallel test in tests/orders_test.py:test_concurrent_orders.

Localized: src/orders/email.py:23 — `current_user.name` is read inside the email
           render template, but the template renderer is invoked from a worker
           that re-uses a thread-local user context across jobs.

Root cause: State leak (taxonomy: state leak / thread-local misuse). The worker's
            user context is set per job but not cleared between jobs, so a fast
            second job reads stale context from the first.

Fix: src/workers/email_worker.py:47 — wrap render in `with user_context(order.user):`
     so the context is scoped to the job, not the worker thread. 4 lines changed.

Test: tests/workers/email_worker_test.py:test_concurrent_jobs_isolated — submits
      10 jobs with 10 distinct users in parallel, asserts each rendered email
      contains its own user's name. Fails on pre-fix code (~30% mismatch),
      passes on post-fix code (0/1000 trials).
```

That's the standard.
