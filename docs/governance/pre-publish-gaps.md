# Gaps to close before the repository is published

> **Status:** Working list · started 2026-11-08 during the documentation pass. Each line is something found that should be fixed, run or decided before the repository is made public. It is not part of the README. When an item is closed, strike it with the date and a pointer; items that are larger than a fix are also in the [open-items register](open-items-register.md) (the number is given).

## Evidence to produce

| # | Gap | What closes it |
|---|---|---|
| 1 | The test and coverage record has been run for the JavaScript suites only; the .NET suites and the Redis and Cosmos tests have not been counted with the containers up | Run `node scripts/ci/test-report.mjs --write` with Redis and the Cosmos emulator up, commit the record (`docs/evidence/test-and-coverage-<date>.md`) |
| 2 | Coverage covers the unit and service tests only: the web apps' screens and the Android screens are exercised by browser suites and Maestro flows that the measurement does not include; the Android app's unit-test coverage is 66.9% because its screens are not unit-tested | Decide whether to add browser-driven coverage (Playwright coverage for the Next.js apps) or to state the boundary, as the testing hub does now |
| 3 | All fifteen Maestro flows have not run in one cold run (a cold run of fourteen passed twelve; the other two passed alone) | `node scripts/dev/mobile-flows.mjs` from cold, recorded |
| 4 | The first run on Azure Pipelines of the `queue`, `session` and `mobile` jobs, and a cold-machine run of the demo with a stranger's reading of it (`WI-DEMO-001`) | The runs, recorded |
| 5 | The 66-minute soak overlapped some of the author's own test runs, so its p99 and maximum are the weaker figures; the cache latency was measured with the in-process provider and a small catalog | A rerun on a quiet machine; a Redis-provider measurement |
| 6 | Three failures are described but not run against the real dependency: the issuer down, a Cosmos outage, a cache Redis outage under load; and the catalog failing during checkout has no typed error (register 165, 166) | A run for each, recorded, and the BFF code for 165 |
| 7 | No latency budget exists (register 100); the proposed targets in NFRs 3.8, 3.9, 5.1 and 5.2 await the lead's confirmation (register 130) | The lead sets the numbers |

## Documents to bring up to date

| # | Gap | What closes it |
|---|---|---|
| 8 | The test strategy's layer table and diagram still carry hand-typed counts from 2026-10-30 | Replace them with a link to the generated record once it exists |
| 9 | Pages not read in the 2026-11-08 pass: vision, personas, demo milestones, SLA, monitoring plan, the C4 context and component pages, the DDD pages, the threat model, tech stack, project plan, risk register, budget, stakeholder plan, local development ("verified 2026-10-30") | Read each against the code and the evidence, as the ADR index, timeline, patterns, NFRs and plans were |
| 10 | Register 89's last point is the lead's: whether the cache fallback needs a retry or staleness policy (recommended no for the listing cache) | Decide |

## AI collaboration: the evidence is thinner than the practice

The record has the method, the errors and what caught them, and the cost and time of 15 sessions. It does not have, and the repository says so ("what is measured and what is not"):

| # | Gap | A way to capture it |
|---|---|---|
| 11 | Time saved against a hand-built baseline | Pick one small, well-specified work item, build it by hand with a timer, and compare it with the AI session that built a comparable item (`WI-QA-003` has the experiment's outline) |
| 12 | Rework and review cost | Count the correction commits per session from the git history ("fix", "correct", a review finding) and the review comments the lead made; record them beside the usage figures |
| 13 | Accepted and rejected suggestions | Record each rejected or reworked suggestion in a structured file as it happens (one line: date, what, why, what the control was) so the error table is complete and countable |
| 14 | The usage records stop at the second session of 2026-11-07 | Record the session of 2026-11-08 (the film and this pass) and keep the habit; consider a small script that adds a row to the table |
| 15 | The AI-assisted testing experiment (`WI-QA-003`) has not been run | Run it once, recorded |

## Before the repository is public

Sanitization, licence and the public-repository settings are tracked as register item 93 ("flip day"). The README links the film directly; check that GitHub plays it from the repository view on the day.
