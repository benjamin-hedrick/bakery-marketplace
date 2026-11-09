# Testing: design, execution and coverage

> **Status:** Current · written 2026-11-08 as a guide to documents that already exist. Counts and coverage come from the generated record [`evidence/test-and-coverage-2026-11-09.md`](evidence/test-and-coverage-2026-11-09.md) and from the evidence records linked in each row; run `node scripts/ci/test-report.mjs --write` for a newer one.

The test approach is built on one rule, a test is evidence only if it can fail, and on checking that rule instead of assuming it: tests are broken on purpose, repeated to measure flakiness, and run on a clean Linux agent because the development machine is Windows.

## Design

The layers, from the cheapest to the widest claim ([test strategy](process/test-strategy.md) has what each one proves and what it does not):

| Layer | What it checks | Where |
|---|---|---|
| Unit | Cart, checkout input, allergen matching, session logic, the queue display's logic | `packages/customer-core`, `packages/web-session`, `apps/mobile-customer`, `apps/web-queue-display` |
| Contract | Every adapter (cache, repository, event transport, session store) passes one shared suite, with a chaos decorator injecting failure where resilience matters | `tools/tests/*`, [patterns 1](architecture/patterns.md) |
| Service | The catalog, ordering and notification services hosted in process, on in-memory backends or on Redis and the Cosmos emulator | `services/*/tests` |
| BFF | Field mapping, error mapping, token forwarding, generated-input tests | `services/graphql-bff/test` |
| Browser, mock-backed | Each web app in a real browser against a mock BFF, including accessibility scans; Chromium, Firefox, WebKit and phone profiles | `apps/web-customer/tests/e2e`, `apps/web-queue-display/tests/e2e` |
| Real stack | Browser journeys against the real services, database, event stream and issuer | `apps/web-customer/tests/skeleton`, `scripts/ci/skeleton-smoke.mjs` |
| Mobile | Fifteen Maestro flows on an Android emulator against the real stack | `apps/mobile-customer/.maestro` |

Working rules, each with the reason it exists ([test strategy, principles](process/test-strategy.md), [lessons](method/lessons.md)):

1. **A test is evidence only if it can fail.** Mutation checks break the code on purpose and the intended test must fail; a sample of 10 killed 9 and found the one that tested the framework.
2. **Prove it on a clean Linux agent.** Seven of the ten early test failures passed locally and failed only there.
3. **Real dependencies where the claim is about them,** and a skipped test is never counted as a pass: results are reported as passed, failed, skipped and not run.
4. **Repeat to believe a fix.** One green run does not show a flake is gone.
5. **Every wait in a test has a time limit,** so broken code fails a test instead of hanging it.

How to write and review a test: [Playwright guide](process/playwright-guide.md), [test-review checklist](process/test-review-checklist.md), [verification policy](process/verification-policy.md) (which checks each kind of change carries).

## Execution

- **Before every push:** `node scripts/ci/node-gates.mjs` (19 steps: format, lint, typecheck, documentation checks, in six JavaScript projects: the BFF, web-customer, the queue display, customer-core, the session package and the Android app), `scripts/ci/linux-check.mjs` (the .NET steps in a Linux container limited to two CPUs), `scripts/ci/secret-scan.mjs` over the full history ([quality gates](process/quality-gates.md)).
- **In the pipeline:** ten jobs (`secrets`, `docs`, `terraform`, `dotnet`, `bff`, `web`, `queue`, `session`, `mobile`, `skeleton`) in [`azure-pipelines.yml`](../azure-pipelines.yml); the `dotnet` job asserts that the Redis tests really reached Redis.
- **What has been run, and what it showed:**

| Run | Result | Record |
|---|---|---|
| The customer app's mock-backed browser suite, repeated 10 times | 620 executions, 0 failures; failure-rate bound 0.62% | [quality report](evidence/quality-report-2026-10-30.md), [baseline](evidence/baseline-2026-10-30.md) |
| Ten early test failures, classified | seven found only on a clean agent; causes and fixes recorded | [test reliability](evidence/test-reliability/findings.md) |
| Mutation checks | about ninety by hand over slice 1; the sample of 10 killed 9; each cache invalidation rule broken on purpose | [test reliability](evidence/test-reliability/findings.md) (the figure of about ninety), [baseline](evidence/baseline-2026-10-30.md) (the sample of 10), [WI-CAT-003](product/backlog/WI-CAT-003.md) |
| Cross-browser, mock-backed | customer app 663 of 665, queue display 296 of 300; the 13 earlier failures classified as test flaws, not application defects | [cross-browser](evidence/cross-browser/mock-backed-2026-11-06.md), [diagnosis](evidence/cross-browser/diagnosis-2026-11-06.md) |
| Real-stack journeys | 62 of 62 on the host stack on 2026-11-07; the container run of the earlier set of journeys passed 56 of 56 the same day | [WI-ORD-003](product/backlog/WI-ORD-003.md) (the 62 of 62), [reconciliation of 2026-11-07](product/backlog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-11-07.md), [WI-ORD-010](product/backlog/WI-ORD-010.md) (the 56 of 56); the first runs are in [slice 1](evidence/slice-1/findings.md) |
| Android flows | fifteen Maestro flows on an emulator, with the failed runs recorded | [WI-MOB-001](evidence/WI-MOB-001/maestro-flows-2026-11-04.md) to [WI-MOB-003](evidence/WI-MOB-003/maestro-flows-2026-11-05.md) |
| Generated-input tests, load and soak, a dynamic scan | found and fixed two BFF defects; 762 orders over 66 minutes with none missed; ZAP with no high finding | [WI-SEC-005](evidence/WI-SEC-005/load-soak-2026-11-03.md) |
| Static analysis and dependencies | a SonarQube scan triaged rule by rule; an npm and NuGet audit with SBOMs | [Sonar](evidence/sonar/triage-2026-11-06.md), [audit](evidence/WI-SEC-004/dependency-audit-2026-11-07.md) |
| A failure injected in a runbook | the event broker stopped during checkout: orders confirmed, events delivered after recovery | [runbook run](evidence/runbook-event-broker-2026-10-30.md) |

## Coverage

The record [`evidence/test-and-coverage-2026-11-09.md`](evidence/test-and-coverage-2026-11-09.md) is generated by `node scripts/ci/test-report.mjs --write`: it runs every .NET test project and every `node --test` suite once, and reports tests run, passed, failed and skipped, and line coverage of the product code, with the commit and the mode (whether Redis and the Cosmos emulator were up, since their tests skip without them). It lists the browser suites and counts the Maestro flows, whose results are in the evidence above.

Coverage is line coverage from the unit and service tests. The web apps' screens and the Android screens are exercised by the browser suites and the Maestro flows, which this measurement does not include.

## Read next

[Test strategy](process/test-strategy.md) · [quality gates](process/quality-gates.md) · [patterns](architecture/patterns.md) (what each technique is tested against) · [evidence index](evidence/README.md) · [performance and NFRs](performance-and-nfrs.md) · [AI collaboration](method/ai-collaboration.md) (the errors the controls caught)
