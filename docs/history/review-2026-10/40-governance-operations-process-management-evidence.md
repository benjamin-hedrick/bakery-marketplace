# Review record: governance, operations, process, management, evidence (2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Read in full this pass: `docs/governance/open-items-register.md` (items 1 to 82 as of the read; 83 and 84 are this review's own), `docs/governance/architecture-review.md`; `docs/operations/` (`local-dev.md`, `sla.md`, `monitoring-alerting.md`, the two stub READMEs); `docs/process/` (all five); `docs/management/` (`README`, `budget-cost-estimate`, `risk-register`, `stakeholder-communications-plan`, `project-plan` read earlier, `slice-1/01` to `03`, all eleven `portfolio-slice/` files); `docs/evidence/` (the five older findings files, the slice-1 findings, the trace excerpt). The review's own files (`doc-review/*`, the ledger, the copy-in register) are not reviewed here. Checked against `docs/evidence/facts-sheet-2026-10-29.md`; peer items refer to `peer-copy-in-register.md`.

## Governance

| File | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|
| `open-items-register.md` (353) | Running list; "mark Resolved, do not delete"; "staging area for GitHub Issues" | 82 items by hand; about 20 carry "Resolved" text, a few say Done in prose without the marker (item 33 is fixed per `local-dev.md` but not marked; item 48 is tracking-only; item 54 built). **No machine-readable status**, so counts of open items cannot be computed (the slice-1 triage in `slice-1/03` did it by hand and is already out of date). Stale entries: 2 (Linux emulator), 10 (stub compose, resolved), 11 (tooling "not built"), 19 and 20 ("resolved"), 21/22 (hold `CACHE-002`, which is done), 23 (B2C list incomplete), 31, 49. **The Redis Streams transport gap (finding B2: unreadable messages are acknowledged without dead-lettering, no `XAUTOCLAIM`) is not an item**, only mentioned inside 35's neighbours and `local-dev.md` known gap 4. Items 12 and 13 (board, docs site) are the README's false claims. Peer reference in item 19 | UPDATE: add a Status field to every item (Open, Resolved, Accepted, Tracking), add the B2 item, reconcile the stale entries; keep numbering |
| `architecture-review.md` (27) | Governs how ADRs are proposed, amended, superseded, reviewed | Good content (amend not rewrite, supersede with a number, review cadence derived from experience). Written as a contrast with the peer framework repo: its scope note and three bullets cite `peer-A/...`. Its own cadence ("audit after every 2 to 3 related ADRs") was not followed for ADR-0012 to 0018: four headers went stale | REWRITE in bakery's voice, no peer references; add the amendment-note and status-line practice actually used (ADR-0017/0018 as models) |

## Operations

| File | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|
| `local-dev.md` (148) | The environment guide; verification dated 2026-10-26 | Valuable and mostly accurate for infrastructure, services, issuer, tracing, service auth, ordering, seed. **Gaps:** it has no path for a person to run the whole journey (D-1); the walking-skeleton section ("Four processes") predates ordering and login; known gap 5 says "no Next.js, BFF or trace viewer yet"; "Node 18+" while Node >=24 is required; no `skeleton-smoke.mjs` (including `--keep`) entry; env table lacks ordering, BFF and web variables; verification table not updated since 10-26. Known gap 1 (Cosmos adapter tests skip) still true: 15 skipped in the 10-29 run | UPDATE (a "run slice 1" section is the highest-value edit; see ledger D-1) |
| `sla.md` (42) | Targets traced to the NFRs | Related section says the runbook and `monitoring-alerting.md` are "not yet written" (the latter exists); latency table for checkout includes "Stripe" (a stub); targets not measured. Slice evidence: warm checkout 55 to 78 ms, **cold first checkout about 4.7 s**, which would breach the 1,500 ms p95 target on a cold start | UPDATE with measured numbers and the cold-start finding |
| `monitoring-alerting.md` (35) | Policy layer: thresholds from free-tier ceilings | Thresholds for APIM calls and Event Grid ops describe services that do not exist; no dashboard or alert implemented (`OBS-003`); consistent as policy | KEEP; mark as policy not implemented |
| `runbooks/README.md`, `postmortems/README.md` (3 lines each) | Placeholders | **No runbook and no postmortem exist.** The test-reliability record (10 episodes) is the nearest thing to postmortems and could be shaped into one or two; a real runbook candidate exists (a Redis outage: the slice evidence shows checkout returns `201` after the 2 s inline timeout and the relay publishes once Redis returns) | CREATE one runbook and one postmortem from existing evidence (goals A and B; priority 1) |

## Process

| File | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|
| `quality-gates.md` (65) | The best process document: commands, what is not a gate and why, findings, trigger policy, soft-gate note, evidence format | Current. Minor: "14 tests skipped" for Cosmos suites (15 in this run, counts drift); describes flake evidence format but no trend exists; "Coverage: none measured" is honest. Strong evidence for goal A | KEEP; add the flake record link and the metrics (pass rate, flake rate, time) the plans define |
| `definition-of-done.md` (11), `definition-of-ready.md` (14) | Gates | DoD says "update `docs/project-log.md` if the item changes a tracked artifact" and the project log is badly stale: **the process was not followed, which is the finding**; DoR cites the peer framework's template path | UPDATE (remove peer path; replace the project-log line with the status mechanism chosen) |
| `engineering-standards.md` (24) | PR guidelines, onboarding, secure coding | Onboarding path starts at `project-log.md` and the outline's On Deck, both stale; cites the peer `context-completeness.md` and the stale parking lot | UPDATE |
| `branching-strategy.md` (31) | Trunk-based; naming; promotion path; versioning | Promotion path ("merge to main auto-deploys to dev") describes a deploy that does not exist; says `/tools/event-schemas`; the 2026-10-28 amendment on themed branches is the real practice | UPDATE (label the promotion path as target) |
| Missing | | **No test strategy, no code-review/AI-review guide, no release/rollback note, no dependency/supply-chain policy, no security scanning, no accessibility test policy.** `quality-gates.md` carries pieces of the first | CREATE (test strategy: goals A and B; copy-in CI-31/CI-34) |

## Management

| File | Status and authority | Conflicts and gaps | Disposition |
|---|---|---|---|
| `README.md` (3) | Index | Lists budget, stakeholder plan as "planned" (both exist) | UPDATE |
| `project-plan.md` (78) | Refreshed 2026-10-29 | Matches the repo (read earlier); links to peers none; Phase 4 exit criterion unmet (register 84) | UPDATE as noted (register 84) |
| `budget-cost-estimate.md` (43) | "Review" | **Stale:** Static Web Apps at $0 (ADR-0012 removed it), Azure AD B2C line, no line for the BFF and Next.js hosting, the collector, Azure DevOps or Application Insights; Redis price dated at draft. Register item 23/25 acknowledge | UPDATE once hosting is chosen (item 25); until then mark the lines stale |
| `risk-register.md` (27) | "Proposed defaults" | Eleven risks, all from September. **Not updated for what was learned:** cold-start latency, flaky and environment-leaking tests, the soft CI gate (register 45), event loss on unreadable messages (B2), AI-generated test defects, no deployment so far, the public-repo exposure. R-11 cites the peer framework. R-10 (schedule, High) is the one that still matters most | UPDATE |
| `stakeholder-communications-plan.md` (29) | Done | Role-based and hypothetical; cadence tied to ACTIVITY-LOG ("self-documenting") which is paused | UPDATE (point to the evidence folder and status table) |
| `slice-1/01..03` | Slice status, plan, prioritized backlog | Current as of 10-29 after the fix; `02` is a planning-time document (open candidate rule "for approval", "once ORD-008 is approved", D-C) and reads as undecided; `03` triage appendix is a point-in-time count by hand | KEEP; add "decided" outcome notes to `02`; regenerate `03` appendix from the register once it has a status field |
| `portfolio-slice/README.md` and `00` to `09` (487 lines) | Adopted 2026-10-26 plans | **`00` states the evidence goals** (layered tests, Playwright, flake and execution-time measurement, a bounded AI-assisted testing experiment, Relay/SSR, BFF without domain, traceable AI work), and these map directly onto the demonstration goals. Status: most Phase 0 to 3 items done; **Phase 4 (invariant and property tests, flake metrics, the AI-assisted testing experiment, security and dependency checks) is not done**; `06` checklist boxes are almost all unchecked though done; `09` says root npm workspace, Jaeger, "Current Active LTS" and pins in `.nvmrc`, none of which matches the repo (no root workspace, Aspire, Node >=24); `04` and `09` say evidence goes to ACTIVITY-LOG, which is paused (no home for the AI-evidence ledger now) | UPDATE statuses; **these plans plus the evidence folder are the strongest alignment with the goals**; a Phase 4 plan is the natural next phase |

## Evidence

| File | Status | Conflicts and gaps | Disposition |
|---|---|---|---|
| `WI-CAT-001/findings.md` (49) | Dated snapshot | Accurate; later updates appended (Cosmos run). Good pattern | KEEP |
| `WI-PORT-001/findings.md` (82) | Dated snapshot; recommendation proceed | Follow-up list partly obsolete (root workspace not created; Node LTS not pinned; "add connection types" done) | KEEP; add a closing "what became of the follow-ups" line |
| `WI-PORT-002/findings.md` (61), `trace-excerpt.txt` | Dated | Says `CorrelationIdMiddleware` "still trusts an inbound header" (fixed 10-28; later section of PORT-005 covers it) | KEEP; add a pointer |
| `WI-PORT-003/findings.md` (58) | Layered updates | **Top "Result" paragraph says the pipeline has not run on Azure, while later sections record green runs and run `#20261029.4`**; the file reads correctly only to the end | UPDATE: put the current result first |
| `WI-PORT-005/findings.md` (46) | "Status: partial" | Layered additions through the collector, Next.js span and consumer spans; header status stale | UPDATE header |
| `slice-1/findings.md` (85) | Current | The strongest file: the real-stack journey, a trace, a privacy scan, observations, honest "not done" list | KEEP; link from README |
| `test-reliability/findings.md` | New (this review) | | KEEP |

## Cross-document findings

1. **Status is carried four ways and none is authoritative:** WI headers, outline icons, epic roll-ups, and prose inside evidence and plans. Fixing that is the single most valuable cleanup (a status table with an evidence link per item).
2. **The "update the project log / ACTIVITY-LOG" rules in DoD, engineering standards, stakeholder plan and portfolio plans point at documents that are stale or paused.** The process outgrew its own checklists; they need a single new answer (commit message + register + evidence, as the CLAUDE.md already says).
3. **The plans for the evidence the goals want already exist (`portfolio-slice/00`, `02`, `05`)** but their Phase 4 items were never done: the AI-assisted testing experiment with a baseline, flake and execution-time metrics, invariant tests, security and dependency checks.
4. **No runbook, no postmortem, no test strategy, no risk update:** operations and management artifacts stop at September.
5. **Peer references to remove:** `architecture-review.md`, `definition-of-ready.md`, `engineering-standards.md`, `risk-register.md`, `open-items-register.md` (19).

## Dispositions summary

KEEP: `quality-gates`, `slice-1/*`, `sla`/`monitoring-alerting` (as policy, updated), the evidence snapshots. UPDATE: the register (status field, B2 item, stale entries), `local-dev.md` (run slice 1; Node version; remove gap 5), DoD, DoR, engineering standards, branching, budget, risk register, stakeholder plan, `management/README`, `portfolio-slice` statuses, three evidence headers. REWRITE: `architecture-review.md`. CREATE: test strategy, one runbook, one postmortem, a Phase 4 plan, a "how to run slice 1" section.
