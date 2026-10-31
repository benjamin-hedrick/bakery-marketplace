# Success Metrics / OKRs

> **Status:** Draft · first version 2026-10-30 (`WI-PROD-004`). The five objectives are the lead's themes; the key results, baselines and targets are proposals for the lead to edit. Reviewed after each slice; next review: when slice 2 completes.

This repository is a small product built as an experiment in AI collaboration, architecture and engineering practice. Its objectives therefore mix product results and practice results. Every key result has a baseline taken from existing evidence where one exists and a mark:

- **Measured today:** a number can be produced now, and the "collected by" column says how.
- **Not yet measurable:** it needs something that does not exist (traffic, a tool, a definition). The target stands as intent; the baseline is "none".

Targets are proposals. Nothing here is a commitment or schedule, and nothing needs deployed traffic to be true.

## O1. Dietary safety is first-class in the product

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR1.1 Allergen information is visible at each point of the browse-to-order path (browse list, listing detail, options when adding to the order, checkout) | 4 of 4 | 3 of 4: the list, detail and option controls show allergens; the checkout form does not (read in `apps/web-customer/src/components/`; the detail page is covered by the skeleton journey `walking-skeleton.spec.ts`) | Read the components; the journey test | Measured today |
| KR1.2 Dietary search and preference work is built (`SRCH-001`, `PREF-001`, `PREF-002`, `CUST-005`, `CUST-006`) | 5 of 5 Done | 0 of 5 (all Ready) | `STATUS.md` | Measured today |
| KR1.3 Orders with zero allergy-related incidents (the north-star safety metric of the [vision](vision.md)) | 100% | None: no orders exist outside tests | Incident reports against completed orders, monthly | Not yet measurable |

*Proposed definition (the lead to confirm).* An allergy-related incident is any report, from a customer or a vendor, that an order was described or prepared in a way that did not match the dietary constraints recorded on it. The rate is orders with no such report divided by completed orders, per month.

## O2. The system is reproducible and its checks are trustworthy

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR2.1 A fresh clone runs the README path green | Pass at every release candidate | 1 of 1: 21 of 21 journeys, 112 s (`docs/evidence/fresh-clone-2026-10-30.md`) | Re-run the fresh-clone procedure | Measured today |
| KR2.2 Browser-suite failures in repeated runs | 0 failures in at least 570 executions per slice | 0 of 620 (62 tests, 10 runs by script, `docs/evidence/quality-report-2026-10-30.md`; 0 of 570 with 57 tests earlier, `docs/evidence/baseline-2026-10-30.md`) | `node scripts/ci/repeat-suite.mjs`: 10 consecutive runs, one worker, no retries | Measured today |
| KR2.3 Sampled tests that fail when their code is broken (mutation sample, by hand) | 9 of 10 or better, on a new sample each slice | 9 of 10; one test exercised the framework, not the project's code (register 85) | Hand-made one-line changes | Measured today |
| KR2.4 Documentation checks enforced automatically (status check, link check) | 2 of 2, confirmed on a pipeline run | 2 of 2 in the pipeline `docs` job (seen green on Azure 2026-10-31, run id not recorded) and in `node scripts/ci/node-gates.mjs` (register 90). Statuses written in prose are mostly unchecked (register 99) | The pipeline or a hook | Measured today |

## O3. AI collaboration is controlled and its results are measured

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR3.1 Assistant errors recorded with the control that caught them | Every error recorded, each with a control | 14 rows in the table, each naming a control (`docs/method/ai-collaboration.md`; one row covers several errors) | The table in that document, kept up to date | Measured today |
| KR3.2 Errors caught by an automated control, not by review | Rising share; target set after a second sample | 7 of the 10 test episodes were found by the clean Linux pipeline or container run (`docs/evidence/test-reliability/findings.md`) | The reliability findings table | Measured today |
| KR3.3 Baseline for AI-assisted testing defined and one comparison run (`WI-QA-003`) | Baseline defined, 1 run recorded | None: the experiment has not been run | The experiment record | Not yet measurable |
| KR3.4 Time saved and rework cost | A method defined first | None: not measured (`ai-collaboration.md`, "What is measured and what is not") | To be defined | Not yet measurable |

## O4. Technology and skills stay current through small experiments

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR4.1 Experiments with a dated written result | At least 2 new per slice | 6: the .NET 10 move (ADR-0010), the Cosmos vNext emulator and SDK 3.63 (ADR-0004 note), the Next.js and Relay server-rendering proof (`WI-PORT-001`), trace propagation (`WI-PORT-005`), the flake baseline and the mutation sample (`baseline-2026-10-30.md`) | Evidence records and ADR notes, counted | Measured today |
| KR4.2 Planned experiments run | 3 of 3 | 0 of 3: AI-assisted testing and the mobile question (`WI-QA-003`), and the review of the documentation-site tool (register 13) | The experiment records | Measured today |
| KR4.3 Dependencies on a supported version, with an audit recorded | An audit recorded each slice | None: no dependency audit exists (`WI-SEC-004`) | `npm audit` and `dotnet list package --vulnerable`, recorded | Not yet measurable |

## O5. Decisions and changes stay traceable

| Key result | Target | Baseline | Collected by | Mark |
|---|---|---|---|---|
| KR5.1 Commits on `main` that name a work item or slice id | At least 90% from slice 2 on | 84 of 165 overall (51%); 84 of 134 since 2026-10-25 (63%). The count is a pattern match on the subject line and approximate | `git log --format=%s`, matched for `WI-`, `S1-` and spec ids | Measured today |
| KR5.2 Specs whose line-1 status matches the generated `STATUS.md` | 100% | 88 of 88 (`node scripts/docs/status.mjs --check`) | The status check | Measured today |
| KR5.3 Findings that are open are in the register with a status | Every finding in the register | 96 of 96 items have a `Status:` (39 Open, 11 Tracking, 17 Deferred, 5 Accepted, 24 Resolved) | `status.mjs --check` and a count | Measured today |

## Open points

- The exact definition of the north-star safety metric (proposed above; the lead confirms).
- Which experiments count as key results (KR4.1 and KR4.2 propose a count, not a list).
- The targets in every table.
- How cleanly the themes carry through: see the review note in the revision log.

## Revision log

| Date | Change |
|---|---|
| 2026-10-30 (later) | Baselines updated for work done the same day: KR2.2 now 620 executions of 62 tests (scripted), KR2.4 now written in the pipeline but not yet confirmed on Azure, KR3.1 now 14 rows. No target or objective changed. |
| 2026-10-30 | First version. Replaced the stub. Five objectives from the lead's themes, 17 key results, 13 measured today and 4 not yet measurable. Baselines from `docs/evidence/` and the repository on this date. |

**Review note, 2026-10-30 (how the themes carried through).** O2, O4 and O5 carried through cleanly: each key result has a number and a baseline that exists. O1 carried through only in part: the product's own safety result (KR1.3) cannot be measured without orders, so the objective is carried by two build-state measures. O3 is the weakest: two of its four key results have no baseline because the AI-collaboration results are described in `ai-collaboration.md` but were not measured as data (time saved, rework, acceptance rate).
