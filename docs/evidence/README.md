# Evidence

> **Status:** Current · written 2026-10-30. An evidence record is a snapshot of something that was run or measured: it begins with a "Current result" line and a date, and it is not edited afterwards except to correct it. A newer run is a new record. The ones below are listed newest first within each group.

## Runs and measurements

| Record | What it shows |
|---|---|
| [`ai-usage-2026-10-31.md`](ai-usage-2026-10-31.md) | Cost, time and token use of two Claude Code sessions as copied from the usage screen, with notes on how to read them |
| [`ai-usage-2026-11-01.md`](ai-usage-2026-11-01.md) | Cost, time and token use of one larger Claude Code session (browser sessions and the vendor queue), as copied from the usage screen |
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

The status of each work item and the evidence pointer on its banner are in [`../product/backlog/STATUS.md`](../product/backlog/STATUS.md).
