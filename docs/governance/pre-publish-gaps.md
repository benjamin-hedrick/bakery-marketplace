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
| 8 | The test strategy's layer table and diagram carried hand-typed counts from 2026-10-30. **Partly done 2026-11-08:** the counts are now dated and name their source (133 customer-app browser tests, 62 real-stack journeys) | Replace them with a link to the generated record once it exists |
| 9 | **Half done 2026-11-08** (commit `cd81374`): the vision, personas, demo milestones, tech stack, event-storming built-state table, SLA cache note and the C4 context are corrected. **Still to do:** the C4 component page (written 2026-10-30; lacks the notification service, the listing cache, `PickupFulfillment` as a consumer and the sessions package); the project plan ("as of 2026-10-28": the status of phases 2, 4, 5 and 6); the risk register (R-12 to R-20 are from 2026-10-30: new risks since, such as long-lived connections, sessions and rate limits); the monitoring plan (checked 2026-10-30; compare with the OpenTelemetry work); the threat model (updated 2026-11-07; verify against the code); the budget (a September snapshot; label it as such and add the dev-environment cost); the stakeholder plan (hypothetical; check its references); the DDD README and glossary; local development ("Run slice 1" verified 2026-10-30: re-verify in a fresh clone) | Read each against the code and the evidence, as the ADR index, timeline, patterns, NFRs, plans and the pages above were. **Second half done 2026-11-08** (the folder pass, architecture and management): the C4 container page and the component page (now ordering, catalog and notification), the DDD README and bounded-context status, the project plan, the risk register (R-21 to R-24 added), the monitoring plan, the threat model (rows on scans, dependencies, the notification service), the budget (labelled), the stakeholder plan (labelled hypothetical). **Still open:** the local-development page in a fresh clone (the status line now says it is not re-verified) |
| 10 | Register 89's last point is the lead's: whether the cache fallback needs a retry or staleness policy (recommended no for the listing cache) | Decide |

## AI collaboration: the evidence is thinner than the practice

The record has the method, the errors and what caught them, and the cost and time of 16 sessions. It does not have, and the repository says so ("what is measured and what is not"):

| # | Gap | A way to capture it |
|---|---|---|
| 11 | ~~Time saved against a hand-built baseline~~ **Closed 2026-11-08 by decision:** no comparison is planned; the record now says the repository was built iteratively with AI collaboration throughout and that the evidence is its records and controls (`ai-collaboration.md`, "How this repository was built") | Done |
| 12 | ~~Rework and review cost~~ **Closed 2026-11-08 as a practice record:** the tuning of the process (the `CLAUDE.md` rule history with commits, guided work, spec-driven and contract-first development, pulling decisions up) is now a table with what prompted each change and its evidence; the rework saved is stated as not measured, and the correction-commit share is shown with why it is not a measure | Done (`ai-collaboration.md`, "How the process was tuned") |
| 13 | Accepted and rejected suggestions: **reviewed 2026-11-08.** The error table has 23 rows, the lessons 37, the register 166 items and four reconciliation records; the documents are not all updated on every change, by design, and the review itself found the overview pages nine days behind (recorded as a row). Keep the practice: add a row whenever a lesson is recorded, and reconcile the table against the lessons and the register at each slice boundary | Ongoing; no tooling needed |
| 14 | ~~The usage records stop at the second session of 2026-11-07~~ **Recorded 2026-11-08:** the session of the film and this pass ($11.14) is in `docs/evidence/ai-usage-2026-11-08.md` and the table in `ai-collaboration.md`. The next session's figures go in the same way | Done; repeat per session |
| 15 | ~~The AI-assisted testing experiment (`WI-QA-003`, row T-34)~~ **Decided 2026-11-08: stays deferred.** The spec page says so and records what is already done (AI-proposed cases, edge cases, boundaries and mutations; the lead's scenarios, seeded users and harness-versus-product decisions); the gap-catalog rows say Deferred; lessons L-35 and L-36 were added, since neither practice was in the lessons although both were in `CLAUDE.md` and the register | Done |

## The full repository pass

Planned 2026-11-08 for the next session. The aim is to read every folder against what it should show, fix what is stale, and position the README for going public. Order and checks:

1. **Root:** `README.md` (positioned last, after the folders), `CLAUDE.md`, `LICENSE`, `.gitignore`, `docker-compose.yml`, the pipelines, `mkdocs.yml`; add what a public repository usually has if missing (a security policy, a contributing note) after asking (done: `SECURITY.md` was kept and linked from the README; `CONTRIBUTING.md` is skipped by decision, register 93).
2. **`docs/`, folder by folder:** `product`, `architecture` (adr, c4, ddd), `process`, `operations` (runbooks, postmortems), `management`, `governance`, `evidence`, `method`, `history`, `product/backlog` (the specs: banners, as-built notes). For each page: accurate against the code and the evidence; status line and date; links; whether it earns its place in the story, and where it sits in the README table.
3. **`services/`, `apps/`, `packages/`, `tools/`, `infra/`, `scripts/`:** READMEs and header comments say what is true (what is built, what was run, what was never run); no dead code or stale comments that contradict the code (lesson L-30); the scripts index is complete.
4. **Across everything:** a sanitization scan (names of employers or organizations, personal paths and e-mail addresses in evidence records and history, anything in `_incoming/`), the secret scan over the full history, the link check, the status check, and the traceability table; the full test and coverage record with the containers up; the gaps in the tables above closed or stated.
5. **Positioning:** re-read the README as a stranger would, from the top, with the film and the table; adjust the summary and the order of the capability rows to the evidence that exists then; check how GitHub renders it (the film link, the poster, the tables).
6. **Flip day** (register 93): the licence, the repository settings and the history decision, with the lead.

Method: one folder at a time, a findings list per folder (stale, wrong, missing, unsafe to publish), fixes in one commit per folder, the gates before every push, and the register or this list for anything that cannot be fixed in the pass.

## Findings of the full read (2026-11-08)

Method: every tracked Markdown file (343 of 343) was read in full against the code and the evidence, with a finding or "no finding" recorded per file; the findings were analysed together and then corrected once per area, one commit each (architecture and hubs; management; process, method and governance; operations; product; READMEs; evidence and history; specs). The first folder pass of the same day had read status lines and numbers only and was corrected by the lead.

**Fixed in the pass:** the hub pages (risk, commit and lesson counts; the citation of the 62 real-stack journeys); the NFRs, the tech stack, the patterns page, the request path, the first-slice contract and the contracts page (a status banner listing what differs from the build); the DDD map and glossary (the dropped preference snapshot); banners on the lifecycle and capability map; dated notes on ADR-0003, 0004, 0006, 0009, 0020 and 0021; the management index, snapshot banners on the slice-1 documents, updates on the portfolio-slice plans, risk R-12 back to Open (it had been set to Mitigated against the evidence of register 98); the branching strategy, test-strategy and playbook counts; the AI-collaboration record (a broken table, the enforcement note, the squash rule, this pass's slips); the rule, checklist and lifecycle pages; lesson L-37; register items 30, 71, 80 and 84 updated and 93 extended; the demo diagram, the film and script pages, the SLA's measured lag and local development (the removed test hook, the ports, the seed); scope, OKRs, vision, personas and milestones; the epic catalog, whose hand-written status words were removed (register 87; `STATUS.md` is the status); the epic files, the gap-catalog states, the reconciliation records, the backlog README and the parking lot; the Android, BFF and session READMEs; Current result lines on seven evidence records; the history README's list of edits and a neutralized role-requirement wording in the October review ledger; dated notes and ticked open points in about twenty specs.

**Still open** (a run, a decision or the lead's review):

| Area | Finding | Fix |
|---|---|---|
| `docs/testing.md` | Links to `evidence/test-and-coverage-2026-11-08.md`, which does not exist yet (the only broken link) | Run `node scripts/ci/test-report.mjs --write` with Redis and the Cosmos emulator up |
| Local development | The fresh-clone check of the page (status line says so) | Repeat the steps in a fresh clone |
| ADR status lines | The status lines of ADR-0019, 0021, 0022 and 0023 are long sentences; the rule is a short line with the detail in a note | Shorten, keeping the text as a dated note |
| ADR-0003 | The unreadable-entry and dead-letter point of the 2026-10-30 note was not re-checked against the transport | Check the transport, then amend the note |
| Epic banners | The gate checks only "N of M"; the lists of items in each state go stale | Generate them, or drop the lists (a script change: ask first) |
| `docs/method/ai-collaboration.md` | The usage table lacks the long session of this pass; the lead supplies the figures | Record them in a new `ai-usage-` file |
| `docs/management/portfolio-slice/` | The goals table in `00` and the rows in `02`, `03`, `04`, `05` keep the October wording under a dated update | Accept, or rewrite when a Phase 4 plan is written |

## Scans of 2026-11-08 (secrets and sanitization)

Full-history secret scan (gitleaks, 426 commits): no findings. Sanitization: local paths in five evidence and history records fixed (the two raw NuGet outputs, the test-reliability findings, the review resume page and the peer copy-in register); the author e-mail and name on every commit and in `LICENSE` are accepted by the lead. `SECURITY.md` already existed and is kept as written; it is now linked from the README. No employer, client or colleague names were searched for (none were given); add them to a grep if any exist.

## Before the repository is public

On flip day, switch on **private vulnerability reporting** in the repository settings (`SECURITY.md` points to it).

Sanitization, licence and the public-repository settings are tracked as register item 93 ("flip day"). The README links the film directly; check that GitHub plays it from the repository view on the day.
