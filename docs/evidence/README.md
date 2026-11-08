# Evidence

> **Status:** Current · written 2026-10-30, index completed 2026-11-08 (records from 2026-10-31 to 2026-11-07 added). An evidence record is a snapshot of something that was run or measured: it begins with a "Current result" line and a date, and it is not edited afterwards except to correct it. A newer run is a new record. The ones below are listed newest first within each group.

## Runs and measurements

| Record | What it shows |
|---|---|
| [`WI-CAT-003/after-2026-11-07.md`](WI-CAT-003/after-2026-11-07.md), with [`baseline`](WI-CAT-003/baseline-2026-11-07.md) | The catalog's listing cache: BFF listings query p50 about 20 ms to about 3 ms and the server-rendered home page about 24 ms to about 8 ms, checkout unchanged; three runs each, in-process provider, small seeded catalog |
| [`WI-SEC-005/client-address-load-2026-11-07.md`](WI-SEC-005/client-address-load-2026-11-07.md) | A control and a fix under load: with one shared rate-limit counter 51 of 54 orders were refused, with per-client counting none |
| [`WI-SEC-005/load-soak-2026-11-03.md`](WI-SEC-005/load-soak-2026-11-03.md) | A 66-minute load and soak of the live vendor queue: 762 orders, none missed by any of five screens, latency percentiles, a service restart at the midpoint, memory flat; with the caveat that part of it overlapped other test runs |
| [`WI-SEC-005/zap-2026-11-03.md`](WI-SEC-005/zap-2026-11-03.md), [`fuzz-2026-11-02.md`](WI-SEC-005/fuzz-2026-11-02.md) | An OWASP ZAP scan of both web apps and the BFF (no high finding; the low findings fixed) and generated-input tests that found and fixed two BFF defects |
| [`cross-browser/mock-backed-2026-11-02.md`](cross-browser/mock-backed-2026-11-02.md) | The first cross-browser run (Firefox, WebKit, phone profiles) of the mock-backed suites; diagnosed on 2026-11-06 (below) |
| [`WI-SEC-004/dependency-audit-2026-11-07.md`](WI-SEC-004/dependency-audit-2026-11-07.md) | The first dependency audit (`npm audit` of six projects, NuGet advisories) and eight CycloneDX SBOMs: no critical or high advisory, 25 moderate in dev tooling and Expo build tooling, three deprecated test packages. |
| [`cross-browser/mock-backed-2026-11-06.md`](cross-browser/mock-backed-2026-11-06.md) | The second full cross-browser run (customer app 663 of 665, queue display 296 of 300) and the fixes and targeted re-runs that followed; the clean full repeat is a later checkpoint |
| [`cross-browser/diagnosis-2026-11-06.md`](cross-browser/diagnosis-2026-11-06.md) | The 13 Firefox and WebKit failures of the first cross-browser run classified: 4 test flaws and 1 reporting difference, no app defect; nothing fixed |
| [`sonar/triage-2026-11-06.md`](sonar/triage-2026-11-06.md) | The second local SonarQube scan (15 bugs, 35 vulnerabilities, 224 code smells) and the triage of each rule: false positives, accepted, fixed, and left for the lead |
| [`ai-usage-2026-11-07-b.md`](ai-usage-2026-11-07-b.md) | Cost, time and token use of the second session of 2026-11-07 ($9.73; `WI-ORD-003`, the dependency audit, the checkout fix and the scripted demo film), with notes on reading the numbers. |
| [`ai-usage-2026-10-31.md`](ai-usage-2026-10-31.md) | Cost, time and token use of two Claude Code sessions as copied from the usage screen, with notes on how to read them |
| [`ai-usage-2026-11-01.md`](ai-usage-2026-11-01.md) | Cost, time and token use of one larger Claude Code session (browser sessions and the vendor queue), as copied from the usage screen |
| [`ai-usage-2026-11-03.md`](ai-usage-2026-11-03.md) | Cost, time and token use of one Claude Code session (the notification service, `NOT-001` and `NOT-002`), as copied from the usage screen |
| [`ai-usage-2026-11-07.md`](ai-usage-2026-11-07.md) | Cost, time and token use of one Claude Code session (CI fixes, the listing cache, cancel buttons, order polling, the fulfillment reconciliation), as copied from the usage screen |
| [`ai-usage-2026-11-04-to-06.md`](ai-usage-2026-11-04-to-06.md) | Cost, time and token use of five Claude Code sessions (the mobile spike and build, the Sonar scan, two register sessions with `WI-ORD-010`), as copied from the usage screen |
| [`ai-usage-2026-11-04.md`](ai-usage-2026-11-04.md) | Cost, time and token use of two Claude Code sessions (order history and personalization), as copied from the usage screen, with notes for the AI collaboration record |
| [`ai-usage-2026-11-02-b.md`](ai-usage-2026-11-02-b.md) | Cost, time and token use of one Claude Code session (vendor actions, rate limits, the security and quality pass), as copied from the usage screen |
| [`ai-usage-2026-11-02.md`](ai-usage-2026-11-02.md) | Cost, time and token use of one Claude Code session (the live vendor queue, `WI-QUE-003`, and its review), as copied from the usage screen |
| [`baseline-2026-10-30.md`](baseline-2026-10-30.md) | Link and stale-phrase baseline, clean-clone build and tests, the browser flake baseline (570 executions), real-stack timings, and a mutation sample of 10 tests |
| [`slice-1/findings.md`](slice-1/findings.md) | The slice-1 customer journey on the real stack, a trace through a checkout, a check of what is exported, and observations |
| [`test-reliability/findings.md`](test-reliability/findings.md) | Ten test failures between 2026-10-26 and 2026-10-29, seven found only on a clean agent, with causes and fixes |
| [`fresh-clone-2026-10-30.md`](fresh-clone-2026-10-30.md) | The README one-command path from a clean clone: 21 of 21 browser journeys pass, 112 s, stack torn down |
| [`runbook-event-broker-2026-10-30.md`](runbook-event-broker-2026-10-30.md) | The Redis outage during checkout, run on the local stack: orders confirmed in about 2.1 s, events published within 6 s of recovery |
| [`quality-report-2026-10-30.md`](quality-report-2026-10-30.md) | The mock-backed browser suite repeated 10 times by script: 620 executions, 0 failures, failure-rate bound 0.62% |
| [`latency-2026-10-30.md`](latency-2026-10-30.md) | Scripted latency of reads and checkout on the real stack, cold and warm; no budget to compare with |
| [`status-check-experiment-2026-10-30.md`](status-check-experiment-2026-10-30.md) | A status changed on purpose: what the documentation checks catch and what they miss |
| [`secret-scan-2026-10-30.md`](secret-scan-2026-10-30.md) | Secret scan of the full history and the working tree: no real secret; four public or dummy values allowlisted |
| [`facts-sheet-2026-10-29.md`](facts-sheet-2026-10-29.md) | The as-built facts the documents quote (projects, endpoints, test counts, what was run and what was only read) |

## Per work item

| Record | Work item |
|---|---|
| [`WI-CAT-001/findings.md`](WI-CAT-001/findings.md) | Catalog listings |
| [`WI-PORT-001/findings.md`](WI-PORT-001/findings.md) | Next.js and Relay server-rendering proof |
| [`WI-PORT-002/findings.md`](WI-PORT-002/findings.md) | Walking skeleton |
| [`WI-PORT-003/findings.md`](WI-PORT-003/findings.md) | Quality and CI baseline |
| [`WI-PORT-005/findings.md`](WI-PORT-005/findings.md) | Trace propagation |
| [`WI-AUTH-007/findings.md`](WI-AUTH-007/findings.md) | Browser sessions on the real stack (cookie session, renewal, the mock issuer's refresh grant) |
| [`WI-QUE-003/`](WI-QUE-003/real-stack-2026-11-02.md) | The live vendor queue: a real-stack run, a review of the GraphQL stream and the path through the web app |
| [`WI-QUE-004/real-stack-2026-11-02.md`](WI-QUE-004/real-stack-2026-11-02.md) | The vendor's actions from the queue display, on the real stack |
| [`WI-RATE-001/run-2026-11-02.md`](WI-RATE-001/run-2026-11-02.md) | The first rate limits, run locally |
| [`WI-DEP-001/`](WI-DEP-001/environment-stack-2026-10-31.md) | The deployment path checked locally: images and Compose, the Terraform foundation and environment stacks, a gate rehearsal and a runtime-configuration spike. **Nothing was applied to Azure.** |
| [`WI-MOB-001/`](WI-MOB-001/maestro-flows-2026-11-04.md), [`WI-MOB-002/`](WI-MOB-002/maestro-flows-2026-11-04.md), [`WI-MOB-003/`](WI-MOB-003/maestro-flows-2026-11-05.md) | The Android app on an emulator: the Maestro flows (with the failed runs recorded) and the unit tests of the session and API logic; local runs, not a pipeline result |
| [`WI-SEC-005/`](WI-SEC-005/load-soak-2026-11-03.md) | Load and soak, generated-input tests and the ZAP scans (above) |
| [`WI-SEC-004/`](WI-SEC-004/dependency-audit-2026-11-07.md) | The dependency audit and the SBOMs |
| [`WI-CAT-003/`](WI-CAT-003/after-2026-11-07.md) | The listing cache's latency |
| [`sonar/triage-2026-11-06.md`](sonar/triage-2026-11-06.md) | Static analysis and what was done with each rule |

The status of each work item and the evidence pointer on its banner are in [`../product/backlog/STATUS.md`](../product/backlog/STATUS.md).
