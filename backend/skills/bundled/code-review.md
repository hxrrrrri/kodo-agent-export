---
name: code-review
description: Use this skill for any code review task — reviewing a diff, PR, branch, file, function, or "look at this code". Triggers on "review", "code review", "look this over", "is this good", "what's wrong with this", "feedback on this code", or when the user pastes a diff/snippet without a specific question. Performs a multi-dimensional review (correctness / security / performance / maintainability / tests) with severity labels and concrete file:line citations. Do NOT use for greenfield design discussion or for executing a fix — only for evaluating existing code.
---

# Code Review

Severity-graded multi-dimensional review of existing code. Output is concrete, citation-backed, and prioritized so the author can act in 30 seconds.

## Operating principles

1. **No vibes.** Every comment cites file:line and names the failure mode.
2. **Severity decides order.** Author reads top-down — P0 must come first.
3. **Fix > flag.** When the fix is small and obvious, write it. When it's structural, name the direction.
4. **Surface, don't litigate.** If you and the author disagree on style, name your preference once and move on.
5. **No drive-by refactors.** This is review, not rewrite. Out-of-scope improvements go in a separate "Adjacent" section.

## Severity scale

Every comment carries one of these labels. Order is strict — never demote a real P0 to "nit" to be polite.

| Label | Meaning | Example |
|-------|---------|---------|
| **P0** | Ships and someone gets paged. Data loss, security hole, or the change does not do what it claims. | SQL injection, dropped writes, auth bypass, off-by-one corrupting state |
| **P1** | Ships and breaks something within a week of normal load. | Race condition under concurrency, memory leak on the hot path, missing error handling on a code path that absolutely runs |
| **P2** | Will hurt later — bug a future maintainer will spend a day on, or a perf cliff. | Quadratic on a path that will scale, hidden coupling, swallowed exceptions, missing test for the only branch that's hard to reproduce |
| **P3** | Quality issue — readability, naming, style, low-impact dead code. | Confusing variable name, comment lies, function does two things, magic number |
| **Nit** | Cosmetic preference. Author free to ignore. | Trailing whitespace, blank line, "I would have used a ternary" |
| **Praise** | Specific thing done well. Worth naming when present. | Tricky edge case handled cleanly, test catches the right invariant |

Praise is not filler. Use sparingly and only when it teaches something.

## Five review dimensions

Scan every diff against all five. Most diffs only earn comments in 1-3, but the scan is mandatory.

### 1. Correctness

The code does what it says it does, including under inputs the author didn't think of.

Specifically check:
- **Edge cases**: empty input, single element, max-size input, null/undefined, negative, zero, boundary values, unicode
- **Error paths**: what happens when the network fails / the file is missing / the input is malformed / the timeout fires
- **State transitions**: can the same operation run twice? out of order? interrupted partway?
- **Off-by-one**: array indices, loop bounds, range checks, `<` vs `<=`
- **Type coercion**: implicit conversion, `==` vs `===`, falsy values, `NaN` propagation, integer overflow
- **Comment vs code drift**: when the comment and the code disagree, both are suspect

### 2. Security

Scan even when the change "isn't security-related." Most security bugs ship in changes labeled "small refactor."

Specifically check:
- **Injection**: SQL, command, LDAP, NoSQL, template, XPath, header — any string concatenation feeding an interpreter
- **Authn/authz**: every code path that touches user data — is the caller's identity verified? are they allowed to access *this* record?
- **Trust boundaries**: data crossing untrusted → trusted is validated; data crossing trusted → untrusted is sanitized
- **Secrets**: no API keys / tokens / passwords in code, logs, error messages, or git history
- **Crypto**: no homemade crypto; no MD5/SHA1 for security; no `Math.random()` for tokens
- **Deserialize**: no untrusted JSON/YAML/pickle/XML deserialization without a schema
- **SSRF / IDOR / path traversal**: any user input that becomes a URL, ID, or path
- **CSRF**: state-changing requests verify origin or token

### 3. Performance

Don't optimize prematurely, but flag the obvious traps.

Specifically check:
- **Algorithmic complexity** on the request path: O(n²) where n grows, nested loops over user data
- **N+1 queries**: loop calling DB / API / disk per element
- **Sync blocking** in async code: `fs.readFileSync` in a request handler, `time.sleep` in async function
- **Allocation in hot paths**: object creation per request, regex compile per call, log formatting that runs always
- **Large payloads**: loading a whole file/result set into memory when streaming is available
- **Caching**: repeated work that has a stable input
- **Indexes**: queries on columns without indexes; queries that defeat indexes (function on column)

### 4. Maintainability

The code is something a teammate can change in six months without dread.

Specifically check:
- **Naming**: function/variable name matches what it does, not what the author was thinking
- **Function shape**: one job per function, parameters justified, return type honest
- **Coupling**: changes here will not require changes in three unrelated files
- **Magic values**: literals with meaning are constants
- **Comments**: explain *why* (the constraint, the invariant), not *what*
- **Dead code**: removed, not commented out
- **Pattern fit**: matches local style; if breaking from local style, the reason is clear and stronger than habit

### 5. Tests

The change is verified, including the failure modes the author claimed to handle.

Specifically check:
- **Coverage of the actual change**: every branch the diff introduces has a test that exercises it
- **Failure tests**: tests for "what should *not* happen" — auth denied, validation rejected, error path returns the right error
- **Boundary tests**: the edge cases from dimension 1 are tested, not just happy path
- **Mocking discipline**: integration boundaries mocked, business logic real
- **Determinism**: no time-of-day, no live network, no random without seed; if flake risk, name it
- **Naming**: test name describes the invariant under test, not the function under test

## Comment template

Every substantive comment uses this shape. Strict.

```
[Severity] file.ext:line — one-line headline of the problem

What: [1-2 sentences of what is wrong]
Why it matters: [the failure mode, named — what breaks, when, for whom]
Fix: [the change, or the direction]
```

Concrete example:

```
P0 src/auth/session.ts:47 — token expiry uses < not <=

What: `if (token.expiresAt < now)` rejects only strictly-expired tokens.
A token whose expiresAt equals now is still treated as valid.
Why it matters: One-second window where revoked tokens authenticate.
Under load, this is a continuous vulnerability, not a corner case.
Fix: Change to `<=`. Add a test at boundary: expiresAt === now → 401.
```

For tiny issues, collapse to one line:

```
P3 src/utils/format.ts:14 — `data` is a useless name; rename to `invoiceLines`
```

## Review structure

Output the review in this exact order:

1. **One-paragraph summary** — what changed, what shape the diff is in, top-level recommendation (Approve / Approve-with-comments / Request-changes / Block)
2. **P0 / P1 issues** — in severity order, each with full template
3. **P2 issues** — same template
4. **P3 / Nit issues** — collapsed format acceptable
5. **Praise** — if anything specific deserves it
6. **Adjacent observations** — out-of-scope things the author should know about, clearly labeled "not blocking this PR"
7. **Tests verdict** — coverage of this change, gaps named

If there are no issues at a severity level, omit the section entirely. Don't write "P0: none" — silence is the signal.

## Top-level recommendation rubric

| Recommendation | Use when |
|----------------|----------|
| **Approve** | No P0/P1/P2. P3/Nit only. Author can ship as-is. |
| **Approve-with-comments** | No P0/P1. P2s exist but are independently fixable / non-blocking. |
| **Request-changes** | One or more P1s, or a cluster of P2s that together change the risk profile. |
| **Block** | One or more P0s, or the change does not do what it claims to do. |

Never approve with a P1 outstanding. If you're tempted, the issue is probably P2 — re-read the severity rubric.

## What to skip

A code review is not:

- A redesign of the feature ("I would have built this differently")
- A style debate that local convention has already settled
- A list of every variable you would have named differently
- A "I haven't read the code but here's general advice" essay
- An opportunity to show off knowledge unrelated to the diff

If you find yourself writing one of these, delete it before sending.

## Anti-patterns

- **Severity inflation** — every comment marked P1 to seem thorough. Author tunes you out.
- **Severity deflation** — calling a real bug "nit" to be polite. Bug ships.
- **Missing the citation** — "there's a race condition somewhere in the auth flow" without a line number is not actionable.
- **Suggestions without direction** — "this could be better" with no proposed change.
- **Reviewing the author, not the code** — comment about what the author should have known. Comment about the code.
- **Dropping a wall of P3s on a P0 diff** — when the diff has a critical bug, the nits can wait.
- **No tests verdict** — silently approving an untested change.
- **Drive-by scope creep** — "while you're in here, also fix X." Move it to Adjacent or a separate ticket.

## Worked example

Diff (hypothetical):

```python
# src/orders/process.py
def charge_order(order_id, user_id):
    order = db.query(f"SELECT * FROM orders WHERE id = {order_id}")
    if order.user_id != user_id:
        raise PermissionError("not yours")
    stripe.charge(order.amount_cents, order.token)
    db.execute(f"UPDATE orders SET status='paid' WHERE id={order_id}")
    return {"ok": True}
```

Review:

```
Summary: Adds charge_order to process payments. The intent is right but the
implementation has a critical injection and a payment-correctness bug.
Recommendation: BLOCK.

P0 src/orders/process.py:3 — SQL injection via order_id
What: f-string interpolation of order_id directly into SQL.
Why it matters: An attacker controlling order_id reads or modifies any row.
This is exploitable, not theoretical.
Fix: Use a parameterized query: db.query("SELECT * FROM orders WHERE id = ?", [order_id]).
Same fix at line 6 for the UPDATE.

P0 src/orders/process.py:5-6 — charge can succeed while DB update fails, double-charging on retry
What: stripe.charge runs before the DB transition. If the UPDATE fails (network blip,
deadlock), the customer is charged but the order is not marked paid. A retry
re-charges them.
Why it matters: Real customer money. This is the canonical outbox pattern problem.
Fix: Either (a) record an idempotency key tied to order_id and check it inside Stripe
to make charge retry-safe, or (b) write a "charging" status before the call, persist the
charge intent, and reconcile asynchronously. Do not ship the current shape.

P1 src/orders/process.py:4 — authz check allows TOCTOU
What: order is read, then user_id is checked, then a second query updates by id.
Between read and update, ownership could change (refund, transfer).
Why it matters: Edge-case but real, especially for support tooling that reassigns orders.
Fix: Include user_id in the UPDATE WHERE clause. Reject if rowcount != 1.

P2 src/orders/process.py:1 — no logging on success or failure
What: Function returns {"ok": True} with no audit trail.
Why it matters: When a customer disputes a charge, there's no record of who triggered it.
Fix: Log charge attempt + outcome with order_id, user_id, charge_id, status.

Tests: No tests touched. For a payment path, this is itself a P0 — at minimum, tests
for: happy path, wrong user (PermissionError), charge failure, DB failure after charge.
```

That review is the standard. Specific, severity-ordered, fix-directed, no padding.
