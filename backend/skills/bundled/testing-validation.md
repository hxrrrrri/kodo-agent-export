---
name: testing-validation
description: Use this skill for any test-writing or validation task — adding tests for new code, increasing coverage, debugging flaky tests, designing a test strategy, choosing what to test vs mock, or validating that a change works. Triggers on "write tests", "add tests", "test this", "what should I test", "this test is flaky", "how do I test X", "verify this works", or any PR that touches code without changing tests. Specifies the test pyramid, what-to-test matrix, fixture design, mocking discipline, flake detection, and contract test patterns. Do NOT use for code review (use code-review) or bug investigation (use bughunter).
---

# Testing & Validation

What to test, how to test it, and how to know the test is real.

## First principle

A test exists to **prove an invariant**, not to "cover" a line of code. Tests that exercise code without checking specific outcomes are a liability — they pass when the code is wrong and break when the code is refactored. Coverage % is a proxy, not the goal.

Every test answers: *what claim about the system is now mechanically guaranteed?*

## Test pyramid (with ratios)

| Layer | What it verifies | Speed | Where to live | % of suite |
|-------|------------------|-------|--------------|-----------|
| **Unit** | A single function/class behaves correctly across inputs | <50ms | next to code | 70-80% |
| **Integration** | Two or more components compose correctly across a real boundary (DB, queue, file) | 50ms-2s | tests/integration | 15-25% |
| **End-to-end** | A user flow works through the real stack (browser, API, DB) | 2s-30s | tests/e2e | 5-10% |
| **Contract** | Two services agree on a wire format | <100ms each side | both repos | as needed |
| **Property** | Invariant holds across generated inputs | varies | property/ | strategic |

If your suite is inverted (mostly e2e), it will be slow, flaky, and expensive to maintain. Push tests *down* the pyramid whenever possible.

## What-to-test matrix

For each unit of new code, scan these dimensions and write a test for every box that has a real signal.

| Dimension | What to assert |
|-----------|---------------|
| **Happy path** | Typical valid input → expected output |
| **Boundary** | Min, max, just-above-min, just-below-max, zero, empty |
| **Invalid input** | Wrong type, malformed, out-of-range — should error correctly, not crash |
| **Empty / null** | `[]`, `{}`, `null`, `None`, `""`, missing optional field |
| **Failure of dependency** | DB down, network timeout, file missing — does the unit handle it or propagate cleanly? |
| **Concurrency** | Two callers at once — does state stay consistent? |
| **Order independence** | Same set of operations in different orders — same final state? |
| **Idempotency** | Running twice gives same result as running once (where claimed) |
| **State transitions** | Each valid transition tested; invalid transitions rejected |
| **Time / timezone** | Behavior at midnight, DST boundary, far-past, far-future |
| **Encoding / unicode** | Non-ASCII input, emoji, RTL text, normalization |
| **Permissions** | Authorized caller succeeds; unauthorized rejected with right error |
| **Quotas / limits** | At-limit, over-limit, near-limit |

You don't write 13 tests per function. You scan all 13 and write the 3-6 that catch real failures for *this* unit.

## Test naming

A good test name describes the **invariant under test**, not the function under test.

Bad: `test_charge_order`
Good: `test_charge_order_rejects_when_user_does_not_own_order`
Good: `test_charge_order_is_idempotent_under_retry`

Pattern: `test_[unit]_[condition]_[expected_outcome]`. When the test fails, the name alone tells you what regression is happening.

## Fixture design

Fixtures are the single biggest source of test rot. Discipline:

1. **Build fixtures from constructors, not from JSON dumps.** A `make_user(name="alice")` factory beats `user.json` for readability and refactoring.
2. **Minimum-viable fixtures.** Each test sets only the fields its invariant cares about. The factory provides plausible defaults for the rest.
3. **No shared mutable fixtures across tests.** Every test gets a fresh instance. Shared fixtures cause order-dependent suites — the worst kind of flake.
4. **Build the fixture in the test, not in setup.** Setup hides what's relevant. A 5-line fixture inline in the test is more readable than a 50-line `setUp()` method shared across 30 tests.
5. **Name the deviation, not the default.** `make_user(banned=True)` is clear. `make_user_4(...)` is not.

Factory pattern (Python):

```python
def make_order(*, user=None, status="pending", items=None, **overrides):
    user = user or make_user()
    items = items or [make_item()]
    return Order(user=user, status=status, items=items, **overrides)
```

Each test calls `make_order(status="paid")` to assert behavior on paid orders. The other fields are sensible defaults that don't matter for this test.

## Mocking discipline

The single most-broken thing in many codebases. Rules:

### When to mock

- **External boundaries**: HTTP calls, third-party APIs, payment providers, email/SMS services
- **Slow I/O**: real DB only when integration testing; unit tests use in-memory or repository mocks
- **Non-determinism**: time, random, UUID — inject a clock / RNG instead of mocking the function

### When NOT to mock

- **Your own business logic.** If a unit test mocks the function under test, the test is fake.
- **Database, in tests that exist to verify schema/queries.** Use a real (test) DB.
- **Pure functions.** Just call them.
- **The code path being tested.** If you mock the thing you're testing, you're testing the mock.

### Mock smell test

If your mock setup is longer than the assertion, the test is fake:

```python
# BAD — mock setup overwhelms the actual claim
mock_db.query.side_effect = [user_row, None, [order_a, order_b], session_row, ...]
mock_cache.get.return_value = None
mock_cache.set.return_value = True
mock_logger.info.return_value = None
# ... 20 more lines of mock setup
result = service.do_thing()
assert result.ok  # the only assertion
```

Either:
1. Test a smaller unit (the mocks tell you the unit is too big), or
2. Use a real (test) DB and skip the mocks entirely (probably an integration test)

### Mock vs Stub vs Fake vs Spy

Use the right one. Confusion here causes most mocking pain:

- **Stub**: returns canned data. (`when(repo.find).thenReturn(user)`)
- **Mock**: stub + asserts it was called correctly. Use sparingly — over-asserting on calls couples tests to implementation.
- **Fake**: working alternative implementation (in-memory DB). Best when you can write one — readable like a real test.
- **Spy**: wraps a real implementation, lets you observe calls. Useful for "did we call X exactly once?"

Default to **fakes** when feasible, **stubs** for return values, **mocks** only when you specifically need to assert call shape.

## Flake detection and elimination

A flaky test is more harmful than no test — it teaches the team to ignore failures.

### Common flake sources

| Source | Signature | Fix |
|--------|-----------|-----|
| Wall-clock dependency | passes by day, fails by night | inject clock, use `freezegun` / `sinon.useFakeTimers` |
| Random without seed | passes 80% of the time | seed the RNG explicitly |
| Concurrency / async | fails under parallel test runner | use deterministic schedulers, avoid `sleep(N)` |
| Port collisions | fails when another test uses same port | dynamic ports, ephemeral instances |
| Order dependence | passes alone, fails after another test | reset state between tests, no global mutables |
| Network call leaking through | passes locally, fails in CI | block all network in unit tests at the framework level |
| Floating-point equality | passes on x86, fails on ARM | compare with epsilon |
| External rate limit | fails sporadically with 429 | mock the external dep |
| Unawaited async | passes if scheduling lucky | `await` everything; lint rule for unhandled promises |
| Test data assumption | "first user" assumption breaks when seed adds another | reference by deterministic property, not ordinal |

### Detection protocol

When a test flakes:
1. **Don't retry.** Retry-on-failure makes flakes invisible. The team stops trusting tests.
2. **Reproduce.** Run the test 100 times locally (`pytest --count 100` / `--repeat 100`). If <100/100 pass, it flakes.
3. **Bisect the cause.** Try in isolation, with random ordering, on different OS, with different random seeds.
4. **Fix the cause, not the symptom.** Adding `time.sleep(0.5)` is not a fix.
5. **If you cannot fix it in 30 minutes, quarantine it.** Mark `@flaky` with a ticket and a date — never with no follow-up.

### CI hygiene

- Tests run with `--randomize-order` (or equivalent) — order dependence surfaces immediately
- All network calls blocked at the runner level for unit tests
- Wall-clock and randomness mocked by default fixture
- Seed printed on failure so failures reproduce
- Minimum 3 successful CI runs per merge, not 1, when stakes are high

## Property-based testing

For pure functions and data structures, property tests beat example tests for surfacing edge cases.

```python
# Example test: "this case works"
def test_reverse_concrete():
    assert reverse([1, 2, 3]) == [3, 2, 1]

# Property test: "this invariant holds for all inputs"
@given(lists(integers()))
def test_reverse_is_involutive(xs):
    assert reverse(reverse(xs)) == xs
```

Properties to look for:
- **Round-trip**: `decode(encode(x)) == x`
- **Idempotence**: `f(f(x)) == f(x)`
- **Inverse**: `g(f(x)) == x`
- **Invariance**: some property of x is preserved by f (length, sum, sortedness)
- **Commutativity**: `f(a, b) == f(b, a)`
- **Associativity**: `f(f(a, b), c) == f(a, f(b, c))`
- **Monotonicity**: if `a < b`, then `f(a) <= f(b)`

Use Hypothesis (Python), fast-check (JS), Quickcheck (Haskell), proptest (Rust). One property test often replaces 20 example tests and catches edge cases you'd never write by hand.

## Contract tests

For service-to-service interactions:

- **Producer side**: test that the producer emits the documented schema for a representative set of cases
- **Consumer side**: test that the consumer accepts the documented schema and rejects malformed input
- **Shared schema**: a single source of truth (OpenAPI, protobuf, JSON Schema) — both sides reference it

Contract tests prevent the "we changed the API and broke 3 downstream services" failure. They catch it at PR time, not at deploy time.

Tools: Pact (most languages), Spring Cloud Contract (JVM), Postman Contracts.

## Coverage discipline

Coverage is a *floor*, not a goal:

- 0% on a critical path = unacceptable
- 100% on trivial getters = waste
- Track *per-module* coverage and require minimums on critical modules (payments, auth, data integrity)
- Never test for the line, always test for the invariant. If the line has no invariant worth asserting, the line shouldn't exist.

Mutation testing (mutmut, Stryker, PIT) is the actual measure: how many introduced bugs do your tests catch? Aim for >70% mutation score on critical modules. If mutation score is low, your tests exercise but don't *check* — fix the assertions.

## Test review checklist

For any PR that adds or modifies tests:

- [ ] Test name describes the invariant, not the function
- [ ] Test fails when the underlying behavior is broken (verify by reverting the production change)
- [ ] Setup is minimal — only fields the test cares about
- [ ] No sleeps, no real network, no real time, no real random
- [ ] Mock setup is short or absent
- [ ] Each test exercises one concept (or it's clearly grouped)
- [ ] Failure message tells you what's wrong, not just "expected X got Y"
- [ ] Test runs in <50ms (unit) or <2s (integration); if slower, justify
- [ ] No order dependence (passes when run alone *and* in the suite)

## Test strategy by change type

What to add, by what kind of change is shipping:

| Change type | Required tests |
|-------------|---------------|
| New pure function | Unit tests covering happy/boundary/invalid |
| New API endpoint | Unit on handler logic + integration on routing/auth + contract on response shape |
| Schema migration | Migration test (apply forward, apply reverse, data integrity check) + integration test on new shape |
| Bug fix | Regression test that fails on pre-fix code, passes on post-fix code (the one rule with no exceptions) |
| Refactor | No new tests needed if behavior is unchanged — but verify existing tests still pass without modification |
| Performance change | Benchmark before/after, with named threshold; regression-guard against perf cliff |
| Security fix | Test that the exploit input is rejected; test that legitimate similar input is still accepted |

## Anti-patterns

- **Tests that pass when the code is wrong.** No assertion or trivial assertion.
- **Tests that fail when the code is correct.** Coupled to implementation, breaks on legal refactors.
- **One giant test per file.** Hard to read, hard to localize failures, slow to debug.
- **Setup that lies.** Fixtures that don't represent realistic data.
- **Coverage as goal.** Writing tests to hit a number rather than verify behavior.
- **Skipping tests until "later."** "Later" never comes. The PR is when tests get written.
- **Mocking the unit under test.** Self-fulfilling green test.
- **Asserting implementation details.** "X was called twice" — couples to implementation. Assert observable behavior instead.
- **Snapshot tests as default.** Snapshots have their place but they lock in *current* behavior, not *correct* behavior. Use sparingly.
- **`@pytest.skip` with no ticket.** Quarantined tests with no plan to revive are dead code that lies about your coverage.

## Output for the user

When this skill is active, deliverable shape:

```
What to test:
  [Bullet list, derived from the what-to-test matrix, of invariants worth locking]

Test plan:
  [The tests to write, with names that follow the test_[unit]_[condition]_[expected] pattern]

Mocking:
  [What's mocked, what's real, why]

Flake risk:
  [Anything in this test that could flake + how it's prevented]
```

If asked to actually write tests, write them following all rules in this skill.
