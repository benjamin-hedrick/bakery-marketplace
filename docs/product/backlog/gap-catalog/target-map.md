# Target document map

> **Status:** Current catalog · the artifacts the October 2026 documentation review found missing or stale, with a **State** and a **Tracked in** column added on 2026-10-30. Rows marked Done point at the document; open rows point at the spec or register item that tracks them. Written 2026-10-29; the tables are unchanged apart from the two new columns. When every row is Done or Dropped this file is archived. Not a commitment of effort and not a delegation plan.

What should exist for the five priorities and the two demonstration goals, set against what exists after the full read (`10` to `40`). "Exists?" says what is on disk now; "Source" says what the new artifact is built from, so most items are assembly and not invention. Nothing here is a commitment of effort: sizes are small (S, about an hour or two of focused work), medium (M, a session) and large (L, several sessions or new code).

Priorities (lead, 2026-10-29): **P1** polished, consistent repo that can go public, showing AI collaboration, architecture/software, and business/project experience; **P2** builds and runs locally; **P3** expand evidence and cover more capabilities; **P4** deploy and tear down a real dev environment; **P5** publicly deployed demo. Demonstration goals: **A** test automation and quality architecture ; **B** web platform and client data fetching (GraphQL/REST, Relay, caching).

## Tier 0: before the repository can be made public (P1, P2)

| ID | Artifact | Serves | Exists? | Source | Action | Size | State | Tracked in |
|---|---|---|---|---|---|---|---|---|
| T-01 | `README.md`: the idea, the architecture in one picture, what is built and verified (and what is not), how to run it, where the evidence is, reading order | P1 | Stale, makes false claims | slice findings, ADR index, status table | Rewrite | M | Done | `README.md` |
| T-02 | `docs/index.md` (docs-site home) | P1 | 3-line stub | README, method README | Rewrite | S | Done | `docs/index.md` |
| T-03 | A person-operable demo: `scripts/dev/demo.mjs` (start the stack, wait, print the web URL and the mock login users, stop on request) and a "Run slice 1" section in `local-dev.md` | P2 | `skeleton-smoke.mjs --keep` leaves Docker running; no host-process demo mode; docs stop at the PORT-002 era | `skeleton-smoke.mjs`, `local-dev.md` | Create + update | M | Done | `scripts/dev/demo.mjs` (run 2026-10-30, 87 s, clean stop) and `docs/operations/demo.md`; "Run slice 1" in `docs/operations/local-dev.md` |
| T-04 | `LICENSE`, `SECURITY.md`, short `CONTRIBUTING.md` | P1 | None | decision needed on the licence | Create | S | Done | `LICENSE` (MIT), `SECURITY.md`; `CONTRIBUTING.md` skipped by decision (register item 93); on the day the repository goes public: the settings listed in item 93 |
| T-05 | Public-readiness check: secret scan of the 160-commit history (container scanner), history note about early commits, scrub of internal-only material (review ledger, copy-in register, peer names) | P1 | Not done | `ACTIVITY-LOG` 10-27 note | Run + decide | M | Done | Secret scan of the history and tree clean (`docs/evidence/secret-scan-2026-10-30.md`, in the pipeline as the `secrets` job); the history findings were accepted and not rewritten (register item 93); internal-only material archived under `docs/history/` |
| T-06 | A short recording or screenshots of the journey (login, browse, customize, order, confirmation) | P1 | Playwright already captures traces/screenshots on failure | journey spec | Create | S | Done | `docs/operations/demo/` (five screenshots by `scripts/dev/capture-journey.mjs`), shown in `docs/operations/demo.md` |
| T-07 | `docs/evidence/README.md`: an index of the evidence with one line each | P1, A | None | the six evidence files | Create | S | Done | `docs/evidence/README.md` |
| T-08 | Honest status page: a generated status table (all work items, epics, ADRs, register items) | P1 | Four inconsistent mechanisms | outcome notes, outline, evidence | Create (script) | M | Done | `docs/product/backlog/STATUS.md`, `scripts/docs/status.mjs` |
| T-09 | Link and stale-phrase check as a script (and a CI step) | P1 | None | this review's grep lists | Create | S | Partly | `scripts/docs/linkcheck.mjs` exists; the CI step is open: register item 90 |

## Tier 1: method and architecture the goals ask about (P1, P3; A, B)

| ID | Artifact | Serves | Exists? | Source | Action | Size | State | Tracked in |
|---|---|---|---|---|---|---|---|---|
| T-10 | `docs/method/` README: how this repository is worked (work items, gates, evidence, reconciliation, AI collaboration) | P1 | New folder approved | copy-in register | Create | S | Done | `docs/method/README.md` |
| T-11 | `method/status-and-supersession.md`: the status vocabulary, banner and note formats (proposed in `52`) | P1 | Not defined anywhere in bakery | outline, WI headers, ADR template | Create | S | Done | `docs/method/status-and-supersession.md` |
| T-12 | `method/glossary.md` (process terms) and `method/work-item-template.md` (copy-in CI-01, bakery statuses) | P1 | Template lives only in the peer repo | peer template, 67 specs | Create | M | Done | `docs/method/glossary.md`, `work-item-template.md` |
| T-13 | `method/ai-collaboration.md`: how the AI is directed here (`CLAUDE.md` as conventions file, approval list, memory notes, themed branches and commit-per-item, register rule), the failure-and-guardrail table (flaky tests, Linux URI bug, wrong-behavior tests, time-zone regex, sold-out options, spent key), what delegated packets taught (handoff integrity, footprint), and what is not claimed | P1, A, B | Not written; strongest differentiator | `CLAUDE.md`, test-reliability, slice findings, packets 01 to 07 | Create | L | Done | `docs/method/ai-collaboration.md` |
| T-14 | `method/reconciliation.md`: the practice, with the 10-25 and 10-26 records and this review as worked examples | P1, A | Records exist, practice not described | dispositions records, `doc-review/*` | Create | M | Open | `WI-DOC-001` (the practice is partly in `status-and-supersession.md`) |
| T-15 | `method/lessons.md` (copy-in CI-04): hypotheses with bakery verdicts | P1, A | None | test-reliability, slice findings | Create | M | Done | `docs/method/lessons.md` |
| T-16 | `method/decisions-and-governance.md`: decision authority (the "human approval required" list and what AI may do), ADR practice, retrospective Permit-to-Build and Permit-to-Operate on slice 1 (copy-in CI-05/06/07) | P1 | Pieces in `architecture-review.md` and `CLAUDE.md` | those, ADR-0017/0018 | Create | M | Partly | Parts are in `architecture-review.md`, `CLAUDE.md` and `rule-authoring.md`; the rest: `WI-DOC-001` |
| T-17 | Decision checklists: technology and business (copy-in CI-02/03) | P1 | None | peer checklists, NFRs | Create (in `method/`) | S | Done | `docs/method/decision-checklists.md` |
| T-20 | Container diagram rewrite (built vs planned; BFF, Next.js, mock issuer, collector, ordering-to-catalog call; Entra) | P1, B | Out of date | ADR-0012/0013/0016/0017/0018 | Rewrite | M | Done | `docs/architecture/c4/container.md` |
| T-21 | Request-path diagram with the trace (browser, Next.js, BFF, ordering, catalog) | P1, A, B | Sequence in `first-slice-contract.md` §2 | slice findings §2 | Create | S | Done | `docs/architecture/request-path.md` |
| T-22 | Component diagram: ordering-service (aggregate, store, outbox, relay, clients, policies) | P1 | `ARCH-005` unbuilt | `services/ordering-service/src` | Create | M | Done | `docs/architecture/c4/component-services.md` |
| T-23 | Patterns page (adapter + fallback + chaos; outbox; idempotency and spent key; reserve/release; BFF as composition; gated test hooks; clean-agent and real-stack verification) with code references (copy-in CI-08/35) | P1, A, B | Scattered across ADRs | ADRs 0001 to 0018, evidence | Create | M | Done | `docs/architecture/patterns.md` |
| T-24 | Decision timeline (one page) | P1 | Dated amendments exist in ADRs | ADRs | Create | S | Done | `docs/architecture/decision-timeline.md` |
| T-25 | API reference: OpenAPI for catalog and ordering (generated or hand-written for the public and service endpoints), the BFF schema, and contract tests between the BFF client and the spec | P1, A, B | None | endpoints in the facts sheet, `first-slice-contract.md` §8 | Create | L | Open | `WI-API-001` |
| T-26 | Web data-fetching guide: SSR versus client, the Relay store rules, error and loading conventions, "when GraphQL, when REST", the three cache layers, how to add a screen | B | In ADR-0012/0013/0014 and `apps/web-customer/README.md` | those | Create | M | Open | `WI-DOC-003` |
| T-27 | Measured NFR baseline: a repeatable latency/throughput run with recorded results (browse, checkout cold and warm), then update `nfrs.md` and `sla.md` | A, B | Two timings in slice findings | a small script, results in `evidence/` | Create + update | M | Partly | The latency run is scripted (`scripts/dev/measure-latency.mjs`; results in `docs/evidence/latency-2026-10-30.md` and `nfrs.md` section 8). Throughput is not measured; `sla.md` is unchanged because no target exists (register item 100) |
| T-28 | Cache made real: `CAT-003` (cache-aside in catalog) and `PORT-004` (per-cache record for layers 1 to 3, stale and unauthorized-data tests) | B | Specs exist, unbuilt | ADR-0002/0014 | Build | L | Open | `WI-CAT-003`, `WI-PORT-004` (specs exist) |
| T-29 | `tech-stack.md` rewrite with a Confirmed versus Built/Verified split and versions | P1, B | Out of date | facts sheet | Rewrite | M | Done | `docs/architecture/tech-stack.md` |

## Tier 1 (continued): quality and testing (A)

| ID | Artifact | Serves | Exists? | Source | Action | Size | State | Tracked in |
|---|---|---|---|---|---|---|---|---|
| T-30 | Test strategy: layers, what each proves, what is deliberately not tested, release gates as pass/fail policy | A | Pieces in `quality-gates.md`, `portfolio-slice/02` | those, test-reliability | Create | M | Done | `docs/process/test-strategy.md` |
| T-31 | Playwright framework guide: structure, fixtures and `support.ts`, test-hook gating, determinism rules, how to add a test | A | In the code only | `apps/web-customer/tests` | Create | M | Done | `docs/process/playwright-guide.md` |
| T-32 | Quality metrics: an aggregator over `summarize-results` JSON, a repeat-run job for flake rate, a report (pass rate, flake rate, execution time trend) | A | One JSON per run, no trend | `quality-gates.md` evidence format | Create (script + CI job + report) | L | Partly | The aggregator and report (`scripts/ci/quality-report.mjs`) and the repeat-run command (`scripts/ci/repeat-suite.mjs`) are done, with a first report (`docs/evidence/quality-report-2026-10-30.md`). No CI job repeats the suite: it would use build minutes (ADR-0015 decision to save them) |
| T-33 | Traceability table: work item to tests to evidence (the XRay idea without the tool), generated from the status table | A | None | T-08 | Create | M | Done | `docs/product/backlog/TRACEABILITY.md`, generated by `scripts/docs/traceability.mjs` (as generated 2026-10-30: of 51 Done items, 26 are named by a test file, 15 by an evidence record, 16 by neither; many of those are documents); checked in the `docs` pipeline job |
| T-34 | The AI-assisted testing experiment from `portfolio-slice/02` and `05` Phase 4: protocol, baseline, results, rejected cases, review cost | A | Planned, never run | plans, test-reliability | Run + write | L | Open | `WI-QA-003` |
| T-35 | Mobile/Maestro decision and a small proof (first verify Maestro's current web support; otherwise a thin mobile client or document as a decision) | A | Plan says "future path only" | `portfolio-slice/00` | Decide, then M to L | M-L | Open | `WI-QA-003` |
| T-36 | Security and supply-chain checks in the pipeline: dependency audit, secret scan, SBOM | A, P1 | Lock files only; `npm audit` run by hand; secret scan added to the pipeline 2026-10-30 (not yet run on Azure) | worklog STD-002/003 | Create | M | Partly | `WI-SEC-004` |

## Tier 1 (continued): operations and project (P1)

| ID | Artifact | Serves | Exists? | Source | Action | Size | State | Tracked in |
|---|---|---|---|---|---|---|---|---|
| T-40 | One real runbook (Redis outage and outbox recovery; the cold-start checkout) | P1 | Placeholder README | slice findings, `ORD-005` evidence | Create | S | Open | `WI-OPS-002` |
| T-41 | One postmortem (a staged game day or the flake series) and a chaos scenario with evidence (BAK-012) | P1, A | Placeholder README | test-reliability | Create | M | Open | `WI-LAUNCH-002`; the chaos scenario: catalog entry `EVT-004` |
| T-42 | Risk register update (cold start, flakes, soft gate, event loss B2, AI test defects, no deployment, public-repo exposure) | P1 | Eleven risks, all September | register, evidence | Update | S | Done | `docs/management/risk-register.md` |
| T-43 | `roadmap.md` and `okrs.md` made real (phases, slice 1 done, next work; the four vision measures and how each would be measured) | P1 | 3-line stubs | project plan, vision, N-items | Rewrite | M | Partly | `docs/product/roadmap.md` is written; OKRs: `WI-PROD-004` |
| T-44 | Next-phases plan: the N-items re-ranked against the goals and priorities (see "Suggested order" below) | P1, P3 | `slice-1/03` ranks by September logic | `slice-1/03`, this map | Create | M | Partly | The candidate order is captured in `docs/product/roadmap.md`; the lead sets the priorities |
| T-45 | GitHub Projects board seeded from the status table | P1 | Not created (register 12) | T-08 | Create after T-08 | S | Open | register item 12 |

## Tier 2: skills and evidence beyond the current slice (P3)

| ID | Artifact | Serves | Source | Size | State | Tracked in |
|---|---|---|---|---|---|---|
| T-50 | Vendor read side and queue display (`N-03`, `N-04`): the event consumer, the "strongest demo moment" in the plan, and a second web app that also proves the shared-code pattern | P3, A, B | `QUE-001/002`, register 29/75/76 | L | Open | `WI-QUE-001`, `WI-QUE-002`; register items 29, 75, 76 |
| T-51 | Shared web package or design-system story (extract only what two apps share) | B | `PARKING-LOT` item, `lib/` | M-L | Open | `docs/product/backlog/PARKING-LOT.md` (shared web package item) |
| T-52 | Observability dashboard and alert rules against the monitoring policy (`OBS-003`) | P3, A | `monitoring-alerting.md`, collector configs | M | Open | catalog entry `OBS-003` |
| T-53 | Dietary-safety personalization (`PREF-*`, `SRCH-001`, `CUST-005/006`): vision principle 1 end to end | P1, P3 | specs exist | L | Open | `WI-PREF-001`, `WI-PREF-002`, `WI-SRCH-001`, `WI-CUST-005`, `WI-CUST-006` |
| T-54 | Chaos scenarios as a visible capability beyond the cache (event duplication, out-of-order, broker outage) | A | worklog BAK-012, `EVT-004` | M | Open | catalog entry `EVT-004`; `WI-LAUNCH-002` |

## Tier 3: deployable (P4, P5)

| ID | Artifact | Serves | Source | Size | State | Tracked in |
|---|---|---|---|---|---|---|
| T-60 | Hosting decision (ADR) and budget update (register 25) | P4 | ADR-0012/0013, budget | S | Open | register item 25; `WI-DEP-001` |
| T-61 | Container images and a deploy stage for the four runtimes (catalog, ordering, BFF, web); time-zone data check (register 71) | P4 | Dockerfile exists only for the mock issuer | L | Open | register item 71; `WI-DEP-001` |
| T-62 | Terraform dev environment with apply and destroy scripts, cost guard | P4 | `infra/` key vault module | L | Open | `WI-DEP-001` |
| T-63 | Entra DEV: app registrations, role assignment, credential (`N-02`; **human approval, IAM**) | P4 | ADR-0018 | L | Open | register item 62; backlog N-02; `WI-AUTH-006` (human approval, IAM) |
| T-64 | Post-deploy smoke running the journey against the deployed URL | P4, P5, A | `skeleton` job | M | Open | `WI-DEP-001` |
| T-65 | Public demo, with teardown and spending limit | P5 | all above | M | Open | `WI-DEP-001` |

## Suggested order (for the next-phases plan)

1. **Make it honest and runnable**: T-08, T-09, T-11, T-03, T-01, T-02, T-07, T-04, T-05. The repository is then presentable and every claim is checkable.
2. **Show the method**: T-13, T-14, T-15, T-16, T-12 (P1's "AI collaboration, project experience").
3. **Show the architecture**: T-20, T-21, T-24, T-23, T-22, T-29, then T-25 and T-26.
4. **Show the quality work**: T-30, T-31, T-33, then T-32, T-34, T-36 (A).
5. **Close the data-fetching story**: T-28, T-27, T-26 (B).
6. **Operations and project artifacts**: T-40 to T-45.
7. **Then new capability**: T-50, T-53 (the demo moment and the principle), T-52, T-54.
8. **Then deployment**: T-60 to T-65, behind the human approvals (Entra, IAM).

Steps 1 to 3 need no new code except T-03, T-08, T-09, T-25; steps 4 and 5 are where the goals' specific requirements (flake metrics, AI-first automation, caching trade-offs) become evidence.

## Gaps this map does not close

- **Mobile** (A) stays open until T-35 is decided.
- **Real payments, notifications, vendor onboarding UI, admin console, reviews, advertising** (MVP features in `portfolio-plan.md`) are not in any tier: they are product breadth, not evidence for the two goals. They remain in the deferred list unless the lead wants them for the product story.
- **RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan** (`portfolio-plan.md` artifacts with no file): cheap documents that strengthen the project-management story (P1). Not tiered above; propose adding T-46 (competitive scan and monetization, S each) and T-47 (RACI and team plan, S each) if the lead wants the project-management side complete.
