# Success Metrics / OKRs

> **Status:** Current · first version 2026-10-30, targets and north-star definition confirmed and baselines refreshed 2026-11-06 (`WI-PROD-004`). Reviewed after each slice; next review: when the next slice completes.

This repository is a small product built as an experiment in AI collaboration, architecture and engineering practice. Its objectives therefore mix product results and practice results. Every key result has a baseline taken from existing evidence where one exists and a mark:

- **Measured today:** a number can be produced now, and the "collected by" column says how.
- **Not yet measurable:** it needs something that does not exist (traffic, a tool, a definition). The target stands as intent; the baseline is "none".

Targets were reviewed by the lead on 2026-11-06 (see the revision log). Nothing here is a commitment or schedule, and nothing needs deployed traffic to be true.

## O1. Dietary safety is first-class in the product

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR1.1 Allergen information is visible at each point of the browse-to-order path (browse list, listing detail, options when adding to the order, checkout) | 4 of 4 | 4 of 4 by reading the components on 2026-11-06: the list, detail, options and checkout form (`CheckoutForm.tsx`, `useCheckoutAllergens.ts`, with the acknowledgement of `CUST-006`) show allergens. Not re-run as one journey on the real stack (register 139, 140) | Read the components; the journeys | Measured today |
| KR1.2 Dietary search and preference work is built (`SRCH-001`, `PREF-001`, `CUST-005`, `CUST-006`; `PREF-002` was superseded by `PREF-001` and `SRCH-001`) | 4 of 4 built (In review or better); Done once the lead has reviewed them | 4 of 4 In review, built and run locally (`STATUS.md`); 0 of 4 Done | `STATUS.md` | Measured today |
| KR1.3 Orders with zero allergy-related incidents (the north-star safety metric of the [vision](vision.md)) | 100% | None: no orders exist outside tests | Incident reports against completed orders, monthly | Not yet measurable |
| KR1.4 Orders that carry allergens where the customer saw the allergy warning, or acknowledged a conflict, before checkout (a leading indicator; `CUST-006`, `ORD-009`) | 100% | None: no orders exist outside tests | The allergens and acknowledgement recorded on each order, monthly | Not yet measurable |

*Definition (confirmed by the lead 2026-11-06).* An allergy-related incident is any report, from a customer or a vendor, that an order was described or prepared in a way that did not match the dietary constraints recorded on it. The rate is orders with no such report divided by completed orders, per month. The constraints are the ones the system stores on the order (the customer's allergens, `ORD-009`, shown to the vendor, `QUE-005`), so a mismatch can be checked against the order record. It cannot be measured until real orders exist, and no number is invented until then. KR1.4 is a separate leading indicator that the system can measure on its own; it is not the north star.

## O2. The system is reproducible and its checks are trustworthy

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR2.1 A fresh clone runs the README path green | Pass at every release candidate | 1 of 1, but old: 21 of 21 journeys, 112 s on 2026-10-30 (`docs/evidence/fresh-clone-2026-10-30.md`). Not re-run since slice 1; the repository has changed a great deal since (register `WI-DEMO-001`, the cold-machine run) | Re-run the fresh-clone procedure | Measured today |
| KR2.2 Browser-suite failures in repeated runs (Chromium only; Firefox and WebKit have 13 undiagnosed failures, register 132) | 0 failures in at least 570 executions per slice | 0 of 620 on 2026-10-30 (62 tests, 10 runs by script, `docs/evidence/quality-report-2026-10-30.md`). Not repeated since the suites grew (customer app and queue display now have 320 and 160 cross-browser executions per run); a CI hang is open (register 144) | `node scripts/ci/repeat-suite.mjs`: 10 consecutive runs, one worker, no retries | Measured today |
| KR2.3 Sampled tests that fail when their code is broken (mutation sample, by hand) | 9 of 10 or better, on a new sample each slice | 9 of 10 on 2026-10-30; one test exercised the framework, not the project's code (register 85). Since then, mutation checks were made per work item (for example `WI-MOB-003`, items 133 and 151), not as a sample | Hand-made one-line changes | Measured today |
| KR2.4 Documentation checks enforced automatically (status check, link check) | 2 of 2, confirmed on a pipeline run | 2 of 2 in the pipeline `docs` job (seen green on Azure 2026-10-31, run id not recorded) and in `node scripts/ci/node-gates.mjs`, which also checks traceability and script indexing. Statuses written in prose are mostly unchecked (register 99) | The pipeline or a hook | Measured today |

## O3. AI collaboration is controlled and its results are measured

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR3.1 Assistant errors recorded with the control that caught them | Every error recorded, each with a control | 23 rows in the table, each naming a control (`docs/method/ai-collaboration.md`; one row covers several errors). The table was extended on 2026-11-08 from the lessons record (L-24 to L-34) and the film runs; errors found by the adversarial pass of `WI-QUE-003` (register items 133, 136 and 151) are in the register and the specs but not all in the table | The table in that document, kept up to date | Measured today |
| KR3.2 Errors caught by an automated control, not by review | Rising share; target set after a second sample | 7 of the 10 test episodes were found by the clean Linux pipeline or container run (`docs/evidence/test-reliability/findings.md`) | The reliability findings table | Measured today |
| KR3.3 Baseline for AI-assisted testing defined and one comparison run (`WI-QA-003`) | Baseline defined, 1 run recorded | None: the controlled experiment is deferred by the lead's decision (2026-11-08); the practice (AI-proposed cases, edge cases, boundaries and mutations; the lead's scenarios, seeded users and harness-versus-product decisions) is recorded without a baseline in `WI-QA-003` and `ai-collaboration.md` | The experiment record | Not yet measurable; deferred |
| KR3.4 Time saved and rework cost | A method defined first | Cost and time are recorded per session (23 sessions: a relative cost of 143.24 against a base of 2.00 and 12 h 39 min of assistant time, `ai-collaboration.md`, "What the sessions cost"); time saved against a hand-built baseline and rework cost are not measured | To be defined | Not yet measurable |

## O4. Technology and skills stay current through small experiments

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR4.1 Experiments with a dated written result | At least 2 new per slice | 13: the .NET 10 move (ADR-0010), the Cosmos vNext emulator and SDK 3.63 (ADR-0004 note), the Next.js and Relay server-rendering proof (`WI-PORT-001`), trace propagation (`WI-PORT-005`), the flake baseline and the mutation sample (`baseline-2026-10-30.md`); and since: the web runtime-config spike (2026-10-31), the gate rehearsal on Azure (2026-11-01), the cross-browser run (2026-11-02), the 66-minute soak and the ZAP scan (2026-11-03), the Maestro flows on an emulator (2026-11-04) and the SonarQube scan (2026-11-05) | Evidence records and ADR notes, counted | Measured today |
| KR4.2 Planned experiments run | 5 of 5 | 2 of 5: the mobile question (answered by `WI-MOB-001` and ADR-0023) and the SonarQube scan (2026-11-05, register 153). Not run: AI-assisted testing (`WI-QA-003`, Deferred), the review of the documentation-site tool (register 13), the review of what is mocked and what each test covers (register 155) | The experiment records | Measured today |
| KR4.3 Dependencies on a supported version, with an audit recorded | An audit recorded each slice | One audit recorded on 2026-11-07 (`docs/evidence/WI-SEC-004/dependency-audit-2026-11-07.md`): no critical or high advisory, 25 moderate in tooling, three deprecated test packages; not yet a pipeline job (`WI-SEC-004`, register 162). The ZAP scan and the SonarQube scan cover other things | `npm audit` and `dotnet list package --vulnerable`, recorded | Not yet measurable |

## O5. Decisions and changes stay traceable

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR5.1 Commits on `main` that name a work item or slice id | At least 90% from slice 2 on | 201 of 326 on `origin/main` (62%) as of 2026-11-06; 201 of 296 since 2026-10-25 (68%). Pattern match on the subject line (`WI-`, `S1-` or an id like `QUE-004`), so approximate; work merged by squash or rebase may lose its id | `git log --format=%s`, matched for those patterns | Measured today |
| KR5.2 Specs whose line-1 status matches the generated `STATUS.md` | 100% | 106 of 106 on 2026-11-06 (`node scripts/docs/status.mjs --check`) | The status check | Measured today |
| KR5.3 Findings that are open are in the register with a status | Every finding in the register | 155 of 155 items have a `Status:` line on 2026-11-06 (55 Open, 12 Tracking, 17 Deferred, 9 Accepted, 52 Resolved, 10 decided or approved and not yet built). Counted by the first word of the status | `status.mjs --check` and a count | Measured today |

## Open points

- How cleanly the themes carry through: see the review note in the revision log.

## Revision log

| Date | Change |
|---|---|
| 2026-11-06 (targets) | Targets reviewed with the lead and kept except: KR1.2 is "built" (In review or better), not Done, and `PREF-002` is dropped (superseded); KR4.2 is 5 of 5 with a named list (mobile question, SonarQube scan, AI-assisted testing, documentation-site tool review, test and mocking review); KR2.2 notes that it covers Chromium only. Baselines refreshed from the repository and the evidence; KR2.1, KR2.2 and KR2.3 are stale and say so. KR1.4 added with the north-star definition. |
| 2026-11-06 | The lead confirmed the north-star definition (with the note that the constraints are those stored on the order) and asked for KR1.4, a leading indicator (not yet measurable). Targets and baselines not yet reviewed; the baselines predate the allergen, notification, mobile and quality work. |
| 2026-10-30 (later) | Baselines updated for work done the same day: KR2.2 now 620 executions of 62 tests (scripted), KR2.4 now written in the pipeline but not yet confirmed on Azure, KR3.1 now 14 rows. No target or objective changed. |
| 2026-10-30 | First version. Replaced the stub. Five objectives from the lead's themes, 17 key results, 13 measured today and 4 not yet measurable. Baselines from `docs/evidence/` and the repository on this date. |

**Review note, 2026-10-30 (how the themes carried through).** O2, O4 and O5 carried through cleanly: each key result has a number and a baseline that exists. O1 carried through only in part: the product's own safety result (KR1.3) cannot be measured without orders, so the objective is carried by two build-state measures. O3 is the weakest: two of its four key results have no baseline because the AI-collaboration results are described in `ai-collaboration.md` but were not measured as data (time saved, rework, acceptance rate).
