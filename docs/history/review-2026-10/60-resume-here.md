# Resume here: documentation reconciliation (written 2026-10-29, end of session)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Everything needed to continue the clean-up in the next session. Read this first; it points to the rest. Nothing in `docs/` outside `docs/governance/` has been changed by the review: the review so far is read-only plus its own records.

## 0. Progress (2026-10-30)

Steps 0 to 9 of `52` are done and committed on `feature/slice-1-doc-reconcile`: the `docs/method/` vocabulary, removals and `CLAUDE.md`, status banners and the seven rewritten specs, the generated `STATUS.md`, ADR status lines and notes, the register Status field, peer-reference removal, architecture (context, container, request path, components, patterns, tech stack, NFRs, DDD), operations, process and management documents, and the front door (README, index, scope, roadmap, demo milestones, `mkdocs.yml`). Step 10 is done except the archive of the review records themselves: `docs/history/` now holds the outline, the project log, the portfolio plan, the milestone documents, the activity log (closed with a header note, R-11), the September delegation packets, the worklogs and the planning notes (R-10, as drafted); the reconciliation records moved to `docs/product/backlog/reconciliation/`; the facts sheet and the baseline moved to `docs/evidence/`; `PARKING-LOT.md` stays live (it is in the method and the onboarding path). The review records (`doc-review/`, the ledger, the copy-in register) were scrubbed of external references and wording on 2026-10-30 and stay in place until the review closes, because steps 11 and 12 still use them; at close they move to `docs/history/review-2026-10/` and the peer names are removed (the copy-in register's job is done once step 11 is). Step 11 is started: `docs/method/ai-collaboration.md`, `context-completeness.md` and `surprise-rule.md` are written (copy-in rows CI-09, CI-30, CI-34, CI-36, CI-50 done; CI-18, CI-31, CI-32, CI-33, CI-37, CI-39 in part). Also written: the lessons record (CI-04), `rule-authoring.md` and the two meanings of fallback (CI-35, CI-08), and `decision-checklists.md` (CI-02, CI-03). The retrospective permits (CI-05, CI-06) were skipped by the lead and the phase account (CI-10) was folded into `docs/architecture/decision-timeline.md`; Step 11 is finished. Step 12 (new artifacts) is not started. The PR is to be squash-merged (the lead, 2026-10-30).

Decisions made 2026-10-30 for Step 9, on my recommendation: R-06 option C (scope and the MVP legend to `docs/product/scope.md` with a state column, the delivery sequence to `roadmap.md`, the structure to the README, the file retired to history); R-09 (the two milestone documents merged into `docs/product/demo-milestones.md`; `project-plan.md` stays the one phase view and `roadmap.md` is now/next/later).

## 1. How to resume

1. Read this file, then `52-edit-plan.md` (definitions and steps) and `61-gap-details-...` (diagram, API, checklist, template and evidence details).
2. Get the lead's answers to the open decisions in section 4 (R-01 to R-20). Start with R-01 to R-04, which block Steps 0 to 2.
3. Create the branch work in the order of `52` section F. The current branch is `feature/slice-1-doc-reconcile`, eight commits ahead of `origin/main` once this file is committed (review records plus one status-wording fix; nothing pushed). Rebase on `origin/main` before any push; the lead opens PRs.
4. Run the facts sheet checks again before relying on numbers (`docs/evidence/facts-sheet-2026-10-29.md` lists what was run and what was only read).

## 2. State of the world (2026-10-29)

| Item | State |
|---|---|
| Slice 1 | Complete and merged; status documents corrected (`eff36c1`); Azure run `#20261029.4` (build id 18) reported green by the lead |
| Review reading | All 188 tracked Markdown files read in full except the review's own three (185 of 185); manifest `00-manifest.md`. Non-Markdown claim-bearing files (pipeline YAML, compose, scripts, Terraform) were treated as facts, not read line by line |
| Review records | `10` root, `20` product, `30` architecture, `40` governance/operations/process/management/evidence, `01` facts sheet, `50` target map, `51` reorganization plan, `52` edit plan, `61` gap details, this file |
| Peer repos | All three read in full (framework 34 files, playbook 30, older playbook 7); nothing edited; roles and copy-in items tracked in `../peer-copy-in-register.md` (CI-01 to CI-50) and the ledger |
| Facts re-run this session | BFF 75, web unit 53, catalog 104, ordering 337 (3 skipped), tools 214 (15 Cosmos tests skipped without the emulator) all passed. Real-stack journeys (21), Azure and anything deployed: **not run here** |
| Public readiness | Not ready: false README claims, no licence, no secret scan, early commits need a review before publication, internal review files and peer names present. The review ledger was redacted before commit; an earlier local commit held material to be removed and was rewritten before any push |
| Branch / commits | `feature/slice-1-doc-reconcile`: `eff36c1`, `07f90e6`, `9f78c7e`, `8799104`, `036b8ef`, `7612f32`, `77b437f` (and this file's commit). **Correction 2026-10-30:** earlier pull requests were merge commits (PR #1, PR #11), which keep every branch commit in `main`; only a squash (or a rewrite) keeps the names out. Decide at PR time (R-20) |

## 3. Decisions already made

| # | Decision | Date | Where recorded |
|---|---|---|---|
| D-01 | Priorities: P1 public-quality repo (AI collaboration, architecture/software, business/project); P2 builds and runs locally; P3 more evidence and capability coverage; P4 deploy and tear down a dev environment; P5 public demo | 10-29 | ledger; memory |
| D-02 | The bakery repo is self-contained; no links or references to the process framework or playbook; copy as-used content instead; peers not edited; reconsider sharing them only if they show extra maturity | 10-29 | ledger, memory, copy-in register |
| D-03 | V2 (fresh iteration) is deferred, not cancelled; V1 continuation and slices were the faster path to evidence | 10-29 | ledger |
| D-04 | `docs/method/` approved and populated as work proceeds | 10-29 | ledger |
| D-05 | `CLAUDE.md` may be corrected (list in `52` §D) | 10-29 | ledger |
| D-06 | `adr/0000-template.md` (duplicate) may be removed | 10-29 | ledger |
| D-07 | Archive the finished instances (packets, worklogs, September planning) into history as items are reconciled and their status is tracked; live folders stay | 10-29 | ledger, `51` |
| D-08 | Define the vocabulary, template and glossary first, then apply them consistently; do not edit before that | 10-29 | `52` §A |
| D-09 | Draft the target document map, reorganization plan and edit plan (done) | 10-29 | `50`, `51`, `52` |
| D-11 | R-01 approved: status vocabulary and notes in `docs/method/status-and-supersession.md` | 10-30 | `method/` |
| D-12 | R-02 confirmed: the 67 statuses and seven calls. Exception made the same day: CUST-004 is split (order history is `WI-CUST-007`, Ready) so CUST-004 is Done; ORD-003 stays In progress (its core, `PickupFulfillment`, is unbuilt, so a split would leave nothing to describe) | 10-30 | `52` §E, `62` |
| D-13 | R-03 decided: rewrite Ready specs to the current design; built specs get an as-built body plus "Changes from the original plan"; no banner | 10-30 | `method/`, the seven specs |
| D-14 | R-04 decided: `WI-DEV-003.md` deleted | 10-30 | commit `a962daa` |
| D-15 | Framing decided 2026-10-30: the repository is a demonstration and reference project (experimentation, AI collaboration, keeping skills and technology current). Documents state goals as "demonstrate ...". Sanitization before going public is a separate, later pass together with the licence and other public-repository files (register item 93) | 10-30 | register 93 |
| D-16 | Sprint plan is Deferred (not Obsolete); iterative work without sprint boundaries | 10-30 | `WI-PLAN-002` |
| D-17 | Squash merge for this PR; local commits that held material to be removed were rewritten before any push | 10-30 | this file, register 93 |
| D-10 | Nothing that is not meant for publication appears in the repository; the capabilities to demonstrate are kept only as neutral goals (A and B) | 10-27, 10-29 | ledger, `ACTIVITY-LOG` |

## 4. Open decisions (the lead's, with options and a recommendation)

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| R-01 | Status vocabulary and note formats (`52` §B1 to B6) | Approve, amend | Approve as drafted, amend after reading | Steps 0 to 5 |
| R-02 | Statuses of the 67 specs (`52` §E) and the seven calls (PORT-005, MGMT-001, CUST-004, ORD-003, SEC-001, PORT-006, DEV-003) | Confirm, change | Confirm; for CUST-004 and ORD-003 split the unbuilt part into its own item so the spec can be Done | Step 2 |
| R-03 | **How to treat specs whose body contradicts what was built** (replaces the "Built differently" banner; see §5) | A rewrite to as-built; B split into an archived original plus a new as-built record; C supersede the spec with a current one; D banner only | **A for unbuilt (Ready) specs, C for built ones** (see §5); not D | Step 2 |
| R-04 | `WI-DEV-003.md` (duplicate of `DEV-004`) | Delete; replace with a Stripe CLI stub | Delete; the outline says `DEV-003` has no spec | Step 1 |
| R-05 | `docs/project-log.md` | Fold into `index.md` and `STATUS.md` then archive; keep hand-maintained | Fold and archive (the log duplicates both and is the most stale file) | Step 3, `CLAUDE.md` pointer |
| R-06 | **`portfolio-plan.md`** (root) | A keep at root with a status column; B move to `docs/product/`; C split: scope and MVP legend to `product/scope.md`, artifacts-by-role to a generated artifact-status table, delivery sequence to `roadmap.md`, repo structure to README, then retire the file to history; D roll everything into README + roadmap + STATUS and retire | **C or D**: its four jobs are now done better by the README, roadmap and status table, and a root planning document competes with the front door. Decide after R-05 | Step 9 |
| R-07 | **ADR set: consolidation or reorganization** (lead's item 2) | (a) keep numbered immutable records, add a *by-concern index* and the decision timeline; (b) merge related records into concern chapters (cache: 0002+0014; entry path: 0008+0013; auth: 0006+0018; frontend: 0011+0012; CI and secrets: 0007+0015); (c) renumber | **(a) first**; judge (b) per cluster after the timeline exists, because ADR numbers are cited in specs, evidence and code comments and the amendment-note discipline is part of the evidence | Step 4 |
| R-08 | Licence | MIT, Apache-2.0, all rights reserved with a note | Lead's choice before going public | T-04 |
| R-09 | Local milestone and plan documents | Merge into one `demo-milestones.md` and archive the rest (recommended in `51`); keep `project-plan.md` as the phase view or fold into `roadmap.md` | Merge into one; decide `project-plan.md` vs `roadmap.md` together (they overlap) | Step 9 |
| R-10 | History folder: name and shape | `docs/history/` with four subfolders (`51`) | As drafted | Step 10 |
| R-11 | `ACTIVITY-LOG.md` | Close with a header note only; also fix three missing separators (touches history) | Header note only | Step 10 |
| R-12 | Which peer content to copy in (copy-in register rows) | Confirm, strike, add | Confirm CI-01 to CI-08, CI-30 to CI-37, CI-50 | Step 11 |
| R-13 | Publish the docs site (register 13) | Pages build from `mkdocs.yml`; skip for now | After the clean-up; needs the nav rebuild | T-08, P1 |
| R-14 | Create work items for this pass and the target map now, with which IDs | `WI-DOC-001..` for the pass; existing prefixes for others; check the backlog for collisions first (the playbook's own lesson) | Create after R-01 and R-03 settle | §6 |
| R-15 | GitHub Projects board scope | Seed from the status table: specs and ADRs only, or also S/N/T items | Specs plus the new work items; skip N-items superseded by the target map | T-45 |
| R-16 | Mobile / Maestro | Verify Maestro's current web support first; thin client; document as a decision | Decide after the verification (small) | T-35 |
| R-17 | Product breadth in the story (RACI, competitive scan, monetization, hiring plan, prioritization, sprint plan) | Add cheap documents; leave as deferred | Add competitive scan and monetization (small) for the product story; leave the rest | `50` closing note |
| R-18 | The review's own files after closing | Archive under `history/review-2026-10/` after scrubbing names; delete | Archive (it is also evidence of method) | Step 10 |
| R-19 | Run the cheap theory tests now (G-H01, H02, H03, H07) | Yes in the next session; no | Yes, first two or three | lessons record |
| R-20 | Confirm nothing that is not meant for publication reaches `main` | Check the PR diff and the squash result; consider a history rewrite only if they do | Check at PR time | PR A |

## 5. The lead's five additions, and what was done with them

**1. "Built differently" banners (R-03).** Agreed it should not add confusion. The seven cases and what exactly contradicts the build:

| Spec | The body says | What was built | Better treatment |
|---|---|---|---|
| `ORD-001` (Done) | `POST /ordering/cart` builds a cart; checkout calls Stripe | No cart endpoint (D-2); checkout takes line items; payment is a named stub | Rewrite the spec to as-built; keep the original in git history and a short "Changes from the original plan" section |
| `ORD-002` (Done) | Statuses `Placed ... Completed` or any state to Cancelled | Adds `Pending`; cancellation by actor and reason; no `OrderCustomized` | Same |
| `CUST-003` (Done) | Stripe.js/Elements card entry; cart state client-side | Test-order button with a stub banner; cart in `sessionStorage` | Same |
| `CUST-004` (In progress) | Confirmation and an order history list | Confirmation and status; no history list | Split history into its own Ready item; rewrite the rest to as-built |
| `TOOL-002` (Done) | Middleware adopts an inbound `X-Correlation-Id` | Never adopts it; value is the trace id | Same (the code block is wrong) |
| `QUE-001` (Ready) | Subscribes to five events including `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup` | The event model changed (lifecycle, ADR-0001 layers) | **Update the requirements now**: it is future work and should describe the current design |
| `EVT-001` (Done) | Envelope has no `traceparent` | Envelope carries `Traceparent` | Same as the built ones |

Reasoning: the "do not rewrite historical specs" convention protects history, but git already preserves it; a spec should be an accurate record of what exists (built) or what is to be done (Ready). A banner that says "this spec is wrong, read the note" is the confusing option. Proposed: **rewrite unbuilt specs to current, and for built specs replace the body with an as-built description plus a "Changes from the original plan" section** (the old text stays in git; the banner then only carries status). Where the lead prefers to keep the original wording visible, split instead: the original goes to history, the as-built record stays. Decision R-03; Step 2 waits for it. The 14 existing outcome notes become the seed of the as-built text.

**2. ADR consolidation (R-07).** Added as an explicit review task before Step 4. Candidate clusters (concern, records, reading): cache (0002, 0014); entry path (0008, 0013); auth (0006, 0018); frontend (0011, 0012); CI and secrets (0007, 0015); data and stock (0004, 0017); observability (0016). Minimum deliverable regardless of the outcome: an ADR map by concern and the one-page decision timeline (`T-24`). Numbers are cited in specs, evidence and code comments, so no renumbering without a link-rewrite plan.

**3. Work items and plans in this pass.** Not yet created, because the template and statuses (R-01) must exist first. Planned (R-14): a work item per themed PR group and per target-map item; see §6. This review is itself the pass-2 content of `WI-PORT-006`, which stays In progress until closed.

**4. Gaps in diagrams, maps, charts, API information, checklists.** Identified at headline level in the records, now detailed in `61`: 19 diagrams/charts (G-D01 to G-D19), 8 API/contract information gaps (G-A01 to G-A08), 10 checklists (G-C01 to G-C10). Each row names the source to build from.

**5. Backfill of templates, standards, checklists, evidence.** Yes: `61` §3 to §6 list 10 templates (G-T01 to G-T10), 8 standards (G-S01 to G-S08) and 10 evidence items (G-E01 to G-E10), most buildable from existing material. They form Step 11 and the early parts of Step 12; the cheap evidence (G-E03, G-E04, G-E05, G-E07) can run first.

**Holistic goal.** "Clean, consistent, easy to digest, without distracting from the main evidence objectives." Added as criteria (section 8) and as the filter for every keep/merge/archive decision, including the consolidation candidates in section 7.

## 6. Work items and plans to create (after R-01, R-03, R-14)

| Provisional ID | Scope | Depends on | Size |
|---|---|---|---|
| `WI-DOC-001` Foundations | Steps 0 to 6 of `52`: method vocabulary, template, glossary; removals; banners or rewrites per R-03; status table and script; ADR status lines; register Status; peer reference removal | R-01 to R-05 | L |
| `WI-DOC-002` Architecture and operations | Step 7 and 8: diagrams (G-D01 to G-D13), tech stack, NFRs, local-dev "run slice 1", SLA, risk register, budget, process documents | WI-DOC-001 | L |
| `WI-DOC-003` Front door and history | Step 9 and 10: README, index, mkdocs, plan documents, demo-milestones, archive, link check | WI-DOC-001/002; R-06 | M |
| `WI-DOC-004` Method and lessons | Step 11: `method/` population from the copy-in register; AI-collaboration record; lessons with verdicts; retrospective permits | WI-DOC-001 | L |
| `WI-DEMO-001` Demo path | `demo.mjs`, the "Run slice 1" section, clean-clone verification (G-E05, T-03) | none | M |
| `WI-QA-001` Quality evidence | Test strategy, Playwright guide, metrics aggregation and repeat-run CI job, flake baseline (T-30, T-31, T-32, G-E03/E04) | WI-DOC-001 | L |
| `WI-API-001` API reference | OpenAPI, GraphQL and event catalog, config and auth reference, contract tests (T-25, G-A01 to G-A08) | none | L |
| `WI-WEB-DOC-001` Data-fetching guide | T-26 and the cache layer diagrams | WI-DOC-002 | M |
| `WI-CACHE-...` | `CAT-003` and `PORT-004` (existing specs) | | L |
| `WI-OPS-...` | Runbook, postmortem, chaos scenario (T-40, T-41, T-54) | | M |
| `WI-PUB-001` Public readiness | Licence, security contact, secret scan, name scrub, checklist G-C05, T-05 | R-08, R-20 | M |
| Plans | Next-phases plan (T-44), Phase 4 plan (AI testing experiment, security checks), roadmap and OKRs (T-43) | `50`, R-06 | M |

Check the backlog for ID collisions (`git grep`) before assigning final numbers.

## 7. Consolidation candidates (roll up, retire or keep)

| Document | Options | Note |
|---|---|---|
| `portfolio-plan.md` | R-06 | Root planning document with four jobs |
| `docs/project-log.md` | Fold into `index.md` and `STATUS.md` (R-05) | Most stale file; the DoD still points at it |
| `docs/management/project-plan.md` vs `docs/product/roadmap.md` | Merge; keep one phase view | Overlap; roadmap is a stub |
| `LOCAL-MILESTONES.md`, `local-demo-execution-plan.md`, `slice-1/01..03`, `portfolio-slice/*` | One `demo-milestones.md`; slice-1 documents become a closed report; plans folded into method/test strategy | Five trackers today |
| `MASTER-BACKLOG-OUTLINE.md` | Split into current plan and epic catalog | `51` |
| `first-slice-contract.md` | Keep as the slice record, add a "final state" summary | Strong as is |
| `tech-stack.md`, `capability-map.md` | Rewrite / keep | |
| `nfrs.md`, `sla.md`, `monitoring-alerting.md` | Keep three, align numbers; consider one "quality attributes" page with the measured baseline | After T-27 |
| `data-model-api-contracts.md` | Split (as-built reference vs target model) | `51` |
| `management/portfolio-slice/00..09` | Fold into method (owners, agent rules) and test strategy (quality plan); archive the rest | After Phase 4 plan |
| `docs/history/ACTIVITY-LOG.md` | History | R-11 |
| `docs/operations/*` | Keep; add runbook and postmortem | |

## 8. Criteria for a clean repository (apply to every keep/merge/archive choice)

1. **One front door**: a visitor reaches README, then a status page, then the evidence, in five minutes (G-D15).
2. **One source of status** per kind of thing (specs, ADRs, register items, documents), generated where possible.
3. **Every claim has a link to evidence or a "not run" note.**
4. **No duplicates**: if two documents say the same thing, one is a pointer or is archived.
5. **History is separate, labelled and short on explanation**: kept as evidence of method, not mixed with live plans.
6. **Evidence objectives first**: a document that neither carries evidence for the goals nor helps a reader navigate is a candidate to archive.
7. **Self-contained**: no references to repositories a reader cannot open; nothing that is not meant for publication; no internal-only files in the public tree.
8. **Dated and verified**: numbers come from the facts sheet; documents say when they were last checked.
9. **Small top level**: README, `CLAUDE.md`, licence, a handful of directories.

## 9. Ordered to-do list for the next session

- [ ] Lead: answer R-01 to R-04 (and R-05, R-06, R-07 if ready).
- [ ] Step 0: create `docs/method/` (README, status-and-supersession, glossary, work-item template).
- [ ] Step 1: removals (R-04 pending), `CLAUDE.md` corrections.
- [ ] Run the cheap evidence/theory items first if time allows: G-E07 (link and stale-phrase baseline), G-E03 (flake baseline), G-E05 (clean-clone check), G-H02 (mutation sample).
- [ ] Step 2 (after R-03): specs and epics per the decision; generate `STATUS.md`.
- [ ] Steps 3 to 6 as in `52`; then 7 to 12.
- [ ] Create the work items in §6 once R-14 is settled.
- [ ] After the reconciliation pass: review the cache, fallback, resiliency and graceful-degradation techniques wherever they are applied, so they stay consistently guided and implemented (register item 89).
- [ ] Decide where the status check (and the link check) is enforced (register item 90).
- [ ] Step 11: write context completeness (proactive, delegated work across plan, delegate, implement, review, refine) and the surprise rule (reactive, any phase) as two separate method documents, with the front-loaded checklists (CI-03, CI-04, CI-09).
- [ ] End of the clean-up: build the lead's overview of the document kinds and their lifecycles from `docs/method/document-lifecycles.md` (a short page or an artifact), after the *to confirm* rows are filled in by steps 7 to 10.
- [ ] Push only a squashed branch, never this working branch: its earlier commits hold review-record text from before the 2026-10-30 scrub, and a merged pull request keeps every pushed commit reachable. Make it with `git switch -c <name> origin/main` and `git merge --squash feature/slice-1-doc-reconcile`, one commit whose message summarises the work (decision D-17).
- [ ] Before any push: rebase on `origin/main`, run the link check, confirm no peer names or other unpublished material in the diff (R-20), batch fixes and agree before pushing.

## 10. Lessons from the review process itself (to feed `method/lessons.md`)

- Sampling is not review: early passes used headers, greps and counts; findings stood but "no finding" meant "unchecked". The full read changed several findings (for example, the capability map was wrongly flagged, and `local-demo-execution-plan.md` at the root was missed and then wrongly called missing until the manifest exposed it).
- A manifest with a read count and one record per folder made completeness checkable; build it first.
- A facts sheet built from commands (test counts run, endpoints read) kept claims honest; docs quote it, not memory.
- I introduced an error that a rule had already guarded against: material not meant for publication in a committed file. Caught in the next read, fixed before any push; the rule belongs in the public-readiness checklist (G-C05).
- The same fact lives in many documents (test counts, ADR counts, statuses); that is the mechanism of drift, so generate and link instead of retyping.
- Tooling note for sessions on this machine: long shell heredocs containing quotes fail to parse; write a script file with the file tool and run it. The shell resets to the repository root each call; background commands start from the last working directory, so use absolute paths. Git warns that CRLF will change to LF on write (`.gitattributes` normalizes); the warnings are expected.

## 11. Facts that exist only outside the repository

- Memory notes (`C:\Users\Ben\.claude\projects\C--git-bakery-marketplace\memory\`): git workflow, register rule, PR troubleshooting pushes (batch fixes, run all gates, push once), portfolio priorities, peer repos and self-containment, and a pointer to this file.
- Earlier session transcripts (four files in the same project folder) hold the history behind the test-reliability record; the record cites commits, so the transcripts are not needed.
- The capabilities to demonstrate were supplied in the session; only neutral goals A and B are in the repository (ledger).
- The peer repositories (`peer-A`, `peer-B`, `peer-C`) are unchanged. The older playbook is obsolete and could be retired; its one unique paragraph is tracked as copy-in CI-50.

## 12. File index for this review

`doc-review/00-manifest.md` (every file, read status) · `docs/evidence/facts-sheet-2026-10-29.md` (as-built truth) · `10`, `20`, `30`, `40` (per-folder records with dispositions) · `50` target map · `51` reorganization · `52` edit plan · `61` gap details · `../doc-reconciliation-ledger-2026-10-29.md` (earlier sampled findings D-, P-, A-, F-, G-, goals, decisions) · `../peer-copy-in-register.md` (peer items) · `../../evidence/test-reliability/findings.md` (recovered flake and environment-leak history).
