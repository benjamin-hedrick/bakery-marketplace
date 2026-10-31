# Browser suite, repeated: quality report (2026-10-30)

> **Status:** Snapshot · 2026-10-30 (the runs are stamped 2026-10-31 UTC), tree at the commit before `scripts/ci/repeat-suite.mjs` was added, Windows 11, Node 25.9.0, Chromium. Produced by `node scripts/ci/repeat-suite.mjs --runs 10` and `scripts/ci/quality-report.mjs` (`WI-QA-002`, rows `T-32`, `G-T10`, `G-D18`). **Current result:** 62 tests (the 57 journeys and states plus 5 accessibility scans), 10 runs, 620 executions, 0 failures, 0 flaky retries; the 95% upper bound on the per-execution failure rate is 0.62%; 31.4 to 34.2 s a run. It describes the suite as it now stands; the record of the 57-test, 570-execution baseline stays in `baseline-2026-10-30.md`.

## How it was run

One production build, the mock BFF and `next start` started once and reused, one worker, no retries, JUnit output per run, run back to back on one machine (`ENABLE_TEST_HOOKS=1` for the web server only). While it ran, only light work (a document check, a status experiment) used the machine. The tables below are the unedited output of `quality-report.mjs`.

## Report

10 runs from 2026-10-31 to 2026-10-31 (UTC), Node v25.9.0. Passed, failed and skipped are separate; a skip is never a pass.

| Suite | Runs | Executions | Failed | Flaky retries | Skipped | Pass rate | Failure rate bound (95%) | Seconds min / median / max |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| mock-browser | 10 | 620 | 0 | 0 | 0 | 100.0% | 0.62% | 31.4 / 33.0 / 34.2 |

### mock-browser, run by run

| Run | Recorded (UTC) | Passed | Failed | Skipped | Flaky | Seconds | |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | 2026-10-31 01:22:01 | 62 | 0 | 0 | 0 | 34.224 | ████████████████████ |
| 2 | 2026-10-31 01:22:37 | 62 | 0 | 0 | 0 | 33.598 | ████████████████████ |
| 3 | 2026-10-31 01:23:12 | 62 | 0 | 0 | 0 | 33.002 | ███████████████████ |
| 4 | 2026-10-31 01:23:47 | 62 | 0 | 0 | 0 | 33.499 | ████████████████████ |
| 5 | 2026-10-31 01:24:22 | 62 | 0 | 0 | 0 | 33.167 | ███████████████████ |
| 6 | 2026-10-31 01:24:57 | 62 | 0 | 0 | 0 | 33.025 | ███████████████████ |
| 7 | 2026-10-31 01:25:32 | 62 | 0 | 0 | 0 | 32.892 | ███████████████████ |
| 8 | 2026-10-31 01:26:07 | 62 | 0 | 0 | 0 | 32.97 | ███████████████████ |
| 9 | 2026-10-31 01:26:41 | 62 | 0 | 0 | 0 | 32.203 | ███████████████████ |
| 10 | 2026-10-31 01:27:14 | 62 | 0 | 0 | 0 | 31.446 | ██████████████████ |

## Reading it

- "Not frequent", not "never": zero failures in 620 executions bound the failure rate near 0.6% on one machine with warm servers and no parallel load. A rarer or environment-dependent flake (the kind a clean Linux agent finds) would not show here (`docs/evidence/test-reliability/findings.md`).
- The duration falls slightly over the ten runs (34.2 s to 31.4 s), which fits warm-up; there is no sign of it growing.
- The bars show each run's time relative to the slowest run: a trend aid, not a chart.
- An earlier two-run trial of the same command (124 executions, 0 failures) was a check of the script, not part of this record.
