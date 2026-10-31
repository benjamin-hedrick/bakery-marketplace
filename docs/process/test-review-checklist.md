# Test review checklist

> **Status:** Current · written 2026-10-30 from the ten test failures in [`docs/evidence/test-reliability/findings.md`](../evidence/test-reliability/findings.md) and the mutation sample in [`baseline-2026-10-30.md`](../evidence/baseline-2026-10-30.md) (`WI-QA-001`, row `G-C07`). Use it when writing or reviewing a test, human or AI. Each line is a question with the failure that taught it. Related: [`test-strategy.md`](test-strategy.md), [`playwright-guide.md`](playwright-guide.md).

## Does it prove anything?

- [ ] **Does it fail when the behaviour breaks?** Change one line of the code it names and run it. A test that stays green proves nothing (the mutation sample found a JWT test that exercised the framework's own validation, so turning issuer validation off in the project's code left it green; register item 85).
- [ ] **Does it test the project's code, or a library?** If a test builds its own validation parameters or its own fake of the thing it names, it tests the library or the fake.
- [ ] **Is the assertion about the behaviour, not the implementation?** The name says what a user or caller gets (`a sold-out item cannot be ordered`), and a harmless refactor does not break it.
- [ ] **Does it use the real dependency when the claim is about that dependency?** A test that silently falls back to an in-memory fake proves less than it appears to (the Cosmos and Redis adapter tests; register items 31 and 35). If it can fall back, does something assert that it did not?
- [ ] **Does a skip say so?** A skipped test is reported as skipped, never as passed.

## Is it deterministic?

- [ ] **No fixed sleeps.** It waits for a condition with a retrying assertion.
- [ ] **No assumption about the clock, time zone, locale or format.** A pattern that matched one time zone's format passed here and failed on the UTC agent.
- [ ] **Unique identifiers under parallelism.** Event transport tests that all used one event type shared a consumer group and took each other's messages; use a fresh id, key or type per test.
- [ ] **No shared mutable state.** A process-wide listener or a non-thread-safe list saw other tests' work; use a per-test scope.
- [ ] **It waits for navigation before reading the page.** Read the URL, then the content.
- [ ] **Absolute counts of shared data are avoided.** Read before, act, read after, compare the difference.

## Does it pass on a clean agent?

- [ ] **No local state it depends on.** Generated files (Relay artifacts) and results folders exist on the development machine and not on a clean one.
- [ ] **No path, separator or case assumption.** On Linux, `Uri.TryCreate` of a relative path gave a `file:` URI that counted as loopback and an insecure endpoint was accepted: a portability bug, found only on Linux.
- [ ] **Has it run on Linux?** `node scripts/ci/linux-check.mjs` for the .NET tests; the pipeline for the rest.
- [ ] **Has it run repeatedly?** Ten times in a row for a browser test; "five in a row" is a rule of thumb, not a statistic.

## Is it maintainable?

- [ ] **Selectors are by role, label or `data-testid`,** not class or position.
- [ ] **A hook that exists for tests is gated.** `ENABLE_TEST_HOOKS` is never set outside tests; a new hook is covered by a test that it is off by default.
- [ ] **A failure is readable.** The message names what was expected; a trace is kept on failure.
- [ ] **Prettier and ESLint pass** (`node scripts/ci/node-gates.mjs`, or `dotnet format` for C#).

## When a test fails

- [ ] Decide first whether it is a **flake** (the same code, different results) or an **environment leak** (passes only because of something left on this machine); they need different cures.
- [ ] Reproduce it before changing it, run every pipeline gate against the final tree, and push once (see `docs/method/ai-collaboration.md`).
- [ ] If the failure shows a class of mistake not on this list, add a line here and a lesson in `docs/method/lessons.md`.
