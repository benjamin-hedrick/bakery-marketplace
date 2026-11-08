# Test reliability: flakes and "passed here, failed there" (2026-10-26 to 2026-10-29)

> **Current result (2026-10-29):** ten episodes (flakes and "passed here, failed there"), seven found only on a clean agent; no data series existed then. The browser suite has since been repeated 10 times by script (620 executions, 0 failures, `quality-report-2026-10-30.md`).

**Status:** reconstructed 2026-10-29. Not recorded at the time as a series; the sources are commit messages and the assistant's reports in the working sessions (local Claude Code transcripts, not committed). Counts such as "2 of 4 runs" are those reports, not measurements saved as data. `scripts/ci/summarize-results.mjs` can record flaky retries per run, but nothing here was captured that way, so there is no trend (see "What is missing").

Two kinds of failure appear, and they need different cures. A **flake** is the same code giving different results (timing, ordering, parallelism). An **environment leak** is a test that passed only because of something left on the developer's machine, and fails on a clean agent every time. The Azure pipeline found most of the second kind, which is the main argument for running every change on a clean Linux agent.

## Episodes

| # | Date | Kind | Symptom | First suspicion | Root cause | Fix (commit) | How it was found |
|---|---|---|---|---|---|---|---|
| 1 | 10-27 | Flake (shared state) | `Eventing` contract tests failed on a fresh Redis: 2 of 3 runs on .NET 10, 4 of 4 passed on .NET 8 | The .NET 10 upgrade | Every test used the same event type, so they shared one Redis consumer group and took each other's messages | Each test uses its own event types; 5 consecutive runs pass on one Redis with no reset (`6dd4240`, register 35) | A runtime change made a latent isolation fault visible |
| 2 | 10-28 | Flake (parallelism) | A tracing test failed on parallel runs | | A process-wide activity listener also saw spans from other test classes | Fixed earlier in the same way as #3; commit not located | Azure run |
| 3 | 10-28 | Flake (parallelism) | `TracingTests.RequestSpansDoNotCarryQueryStringValues` failed on Azure, passed locally; two spans matched | | Same listener problem, plus a non-thread-safe `List`, plus a path (`/catalog/listings`) that other tests also call | Thread-safe collection; span found by a unique query parameter name; a decoy request to the same path is issued concurrently so the parallel case runs every time; catalog tests run four times in a row on Linux (`47efa1f`) | Azure run; the test passed locally because the timing did not line up |
| 4 | 10-28 | Flake (race in a browser test) | The login return-path test failed 2 of 4 runs | | The test read the URL right after the user name appeared, before the router finished | Retrying assertion (`expect(page).toHaveURL`); six green runs in a row (`551f166`) | Repeated runs of the new suite |
| 5 | 10-28 | Flake (same race, second test) | A second login test failed in the same way | "Same race as before, in a different test" | Same | Same pattern applied; the full browser suite ran green 6 times in a row | Repeated runs |
| 6 | 10-29 | Environment leak (time of day and zone) | The journey test failed on Azure, passed locally: expected `Pickup ... 12:00 PM - 12:15 PM` | A narrow no-break space (U+202F) before AM/PM in newer Chromium/ICU | The regex allowed only a one-digit hour in the second time (`\d:\d\d [AP]M`). Locally (Eastern time) the page showed `9:00 AM`; on the UTC agent, `12:00 PM`. The page was correct | The test no longer assumes a format or an hour and picks a pickup window far from the lead-time cutoff (`9c3648c`) | The Azure run before `#20261029.4` (its id was not recorded); the first hypothesis was wrong and was ruled out by testing the regex against its own example |
| 7 | 10-27 | Environment leak (state left behind) | `results` folder missing on the Azure agent | | Local runs wrote to an existing `artifacts/ci` | Every job creates the folder; the summarizer reports missing files clearly (`ab9f7a9`) | First Azure runs |
| 8 | 10-27 | Environment leak (generated files) | `TS2307: Cannot find module '../__generated__...'` in the skeleton job | | `skeleton-smoke.mjs` ran `next build` directly; Relay artifacts are gitignored and existed locally from earlier builds | Compile Relay before the web build (`be2d85c`) | Azure run |
| 9 | 10-28 | Environment leak (platform) | `ClientCredentialsTokenProviderTests` failed on Azure only | | On Linux `Uri.TryCreate("/relative", Absolute)` yields a `file:///` URI, which counted as loopback, so an insecure token endpoint was accepted | Token endpoint must be http(s); validated at startup (`c460db4`) | Azure run. A real portability bug, not a flaky test |
| 10 | 10-28 | Environment leak (toolchain) | Azure agent had only .NET 10 while projects targeted `net8.0` | | Agent image vs project target | Two-SDK workaround (`e0592d4`), then all projects moved to .NET 10 (`6dd4240`) | First Azure runs |

Related, not failures of a test: Redis adapter tests silently fall back to in-memory fakes when Docker is not running (register 35, finding A8), and the mock-backed browser tests and the real-stack smoke shared one `.next` folder (register 43, resolved). The Linux container check (`47893bb`) and the Redis command-count assertion exist because of these.

## What worked

1. **A clean Linux agent early.** Seven of the ten episodes were found by the Azure pipeline or the Linux container check, not on the development machine (Windows, Eastern time).
2. **Repeated runs as the proof of a fix.** "Five in a row", "four in a row", "six green runs in a row" were the stated bar. It is a rule of thumb, not a statistical one.
3. **Testing the test.** The isolation tests were checked by deliberately breaking the code under test (a shared server store made 100 of 200 SSR requests return the wrong data; a non-deterministic render failed the hydration test; about 90 mutation checks over the slice). A guard that cannot fail is not evidence.
4. **Rejecting the first hypothesis.** In #6 the first suspicion (Unicode spacing) was tested and dropped before the cause (the regex) was found. In #1 the .NET upgrade was blamed first and cleared by showing the same fault on the old runtime.
5. **Decision to fix the test, not retry it.** No test is retried to make it pass; the quality-gates document allows quarantine only with an owner and a reason, and no skipped or quarantined test exists in the browser or BFF suites (searched 2026-10-29).

## What is missing

- **No data series.** The numbers above are reported counts. The summarizer writes one JSON per run and nothing aggregates runs or computes a flake rate.
- **No gate on flakiness.** `quality-gates.md` defines the evidence format and a definition of a flake (same commit, different `failed` counts) but no threshold, and no job repeats the browser suite to look for one.
- **Playwright retries are off** (`retries: 0` in both configs), so a flaky pass cannot be seen as a retry count; flakes show up as failures.
- Episode #2's commit and the Azure run ids for #3, #4 and #6 were not looked up.


## Where the underlying detail lives

The rows above are distilled from the commit messages cited and from four Claude Code session transcripts kept on the lead's machine (`~/.claude/projects/C--git-bakery-marketplace/*.jsonl`, not in the repository). The transcripts hold the full diagnosis dialogue (hypotheses tried, commands run, counts). To re-find an episode, search the transcript for its test or file name; approximate locations (line numbers in the file, first eight characters of its name):

| Episode | Transcript | Approximate lines |
|---|---|---|
| 1 Eventing consumer groups | `4b8d9ef7` | 1532 to 1640 |
| 7 results folder missing; 8 Relay artifacts | `4b8d9ef7` | 1365; 1846 to 1908 |
| 3 tracing test (and the earlier tracing flake) | `9549026f` | 3827 to 3880 |
| 9 Linux file URI | `9549026f` | 3121 to 3124, 3619 to 3624 |
| 4, 5 login races | `9549026f` | 6602 to 6694 |
| 6 pickup-time regex | `9549026f` | 8012 to 8150 |

Not recovered: the commit of the first (earlier) tracing-test fix, episode 2; the Azure run ids for episodes 3, 4 and 6 (only run `#20261029.4`, the green one, is recorded in `docs/evidence/WI-PORT-003/findings.md`). Azure's own run history is the place to look if the ids are wanted.
