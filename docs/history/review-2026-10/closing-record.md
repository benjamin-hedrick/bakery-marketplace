# Closing record: the October 2026 documentation review

> **Status:** Historical · written 2026-10-30 when the review's records were moved here. This is the index to the review: what was read, what was found, where each finding went, and which decisions were made. Everything still open is tracked by a spec, a register item or a gap-catalog row; nothing needs to be re-derived from the other files in this folder, which are kept as the working record.

## What the review was

A read of every tracked Markdown file (188 files; the review's own three were not part of the read), with the facts checked by running the build and the tests, followed by a plan, a series of approved decisions, and an edit pass that carried them out (steps 0 to 11 of the edit plan). Three other repositories (a process framework, an AI collaboration playbook and an older playbook, labelled peer-A, peer-B and peer-C in these records) were read to decide what to copy in as this project's own documents. The branch was `feature/slice-1-doc-reconcile`; work item `WI-PORT-006`, pass 2.

| File in this folder | What it is |
|---|---|
| `00-manifest.md` | Every file and whether it was read in full |
| `10`, `20`, `30`, `40` | Findings and dispositions by area: the root and docs root; product and backlog; architecture; governance, operations, process, management and evidence |
| `51-reorganization-plan.md`, `52-edit-plan.md` | The plan, and the ordered steps that carried it out |
| `60-resume-here.md` | The handoff used between sessions: state, decisions, open decisions |
| `doc-reconciliation-ledger-2026-10-29.md` | The first, sampled findings (D, P, A, F, G series) and the decisions of 2026-10-29 |
| `peer-copy-in-register.md` | What was copied in from the other repositories, with its state |

The as-built facts are `docs/evidence/facts-sheet-2026-10-29.md`; the tests and timings are `docs/evidence/baseline-2026-10-30.md`; the target map and gap details moved to the live gap catalog.

## Where the findings went

| Kind of finding | Count | Where it is now |
|---|---|---|
| Artifacts the review found missing or stale | 51 (T-01 to T-65) | `docs/product/backlog/gap-catalog/target-map.md`, with a State and a Tracked-in column |
| Detail rows: diagrams, references, checklists, templates, standards, evidence, theories | 74 | `docs/product/backlog/gap-catalog/gap-details.md`, same columns |
| Document-by-document dispositions (update, rewrite, archive) | many | Carried out by the edit pass; the leftovers are in the table below |
| Ledger findings (D, P, A, F, G series) | 60 | Dispositioned below |
| Decisions and open decisions | 17 and 20 | Dispositioned below |
| Defects, limitations and gaps found | 94 register items by the end | `docs/governance/open-items-register.md` |
| Lessons | 19 | `docs/method/lessons.md` |

At closing, of the 125 gap-catalog rows, the State column shows which are Done; the open ones are tracked by 11 specs (`WI-DEMO-001`, `WI-DOC-001`, `WI-DOC-002`, `WI-API-001`, `WI-DOC-003`, `WI-QA-001`, `WI-QA-002`, `WI-QA-003`, `WI-SEC-004`, `WI-DEP-001`, `WI-EVID-001`) and by existing specs and register items named in the rows. All of them are Deferred, with a trigger, and none is a commitment.

## Ledger findings

| ID | Disposition |
|---|---|
| D-1 | Done: "Run slice 1" in `docs/operations/local-dev.md` |
| D-2, D-3 | Done: `README.md`, `docs/product/scope.md`, `roadmap.md`; the board and the docs site are register items 12 and 13 |
| D-4 | Tracked: the state of each feature is in `scope.md`; the unbuilt features are in the epic catalog |
| D-5 | Done: `CLAUDE.md` corrected with approval; marking its rules as hard or default is register item 94 |
| D-6, D-7, D-8, D-10 | Done: the component READMEs and `docs/index.md` |
| D-9 | Done: the empty folders were removed (register item 86 for the leftover path mentions) |
| D-11, D-12 | Tracked: register item 93 (licence and public-readiness pass); `WI-SEC-004` |
| P-1, P-12 | Done: the outline was split into `current-plan.md`, `epic-catalog.md` and a history snapshot |
| P-2, P-3, P-4, P-6, P-7, P-8, P-10, P-11 | Done: backlog README, roadmap, epic banners, vision and personas, spec banners, demo milestones, history moves, status vocabulary. OKRs are `WI-PROD-004` |
| P-5 | Tracked: ID naming schemes, `WI-DOC-001` (row G-S08) |
| P-9 | Tracked: the parking lot stays live and is under review: `WI-REPO-003` (Deferred) |
| A-1, A-2, A-3, A-4, A-7 | Done: C4 diagrams, ADR status lines and notes, the ADR index, `tech-stack.md`, the first-slice contract |
| A-5, A-6 | Tracked: `WI-API-001`, `WI-DOC-002` |
| A-8 | Done in part: a measured section in `nfrs.md`; the scripted baseline is `WI-QA-002` |
| A-9 | Information only |
| F-2, F-12 | Done: `docs/method/lessons.md`, `docs/architecture/patterns.md` |
| F-5 | Done: the deferred second iteration is recorded in `docs/product/roadmap.md` |
| F-6, F-7, F-9 | Done: banners on the archived worklogs; this project's own work-item template |
| F-8 | Dropped: the permit forms were skipped by the lead (lessons L-06) |
| F-11 | Tracked: a quality and test section in the artifact list, `WI-QA-001` |
| F-15 | Tracked: register item 93 |
| F-1, F-3, F-4, F-10, F-13, F-14 | Not for this repository: findings about peer-A's own content |
| G-1, G-2, G-3, G-7, G-8, G-11 | Done: `docs/method/ai-collaboration.md`, `lessons.md` and the register practice |
| G-4 | Done in part: `context-completeness.md` (context is sufficient, not minimal) |
| G-5, G-6, G-9, G-10, G-12 | Not for this repository: findings about peer-B and peer-C |

## Decisions of the review

| Decision | Where it lives now |
|---|---|
| D-01 Priorities: P1 a polished, consistent repository that can be public (showing AI collaboration, architecture and software, business and project work); P2 builds and runs locally; P3 more evidence and coverage; P4 deploy and tear down a dev environment; P5 a public demo | `docs/product/backlog/current-plan.md` |
| D-02 This repository is self-contained: no links to other repositories; copy as-used content instead | `docs/method/README.md`; the copy-in register in this folder |
| D-03 A fresh second iteration is deferred, not cancelled | `docs/product/roadmap.md` |
| D-04 to D-09 `docs/method/`, `CLAUDE.md` corrections, removal of the duplicate ADR template, archiving finished instances, vocabulary first, the draft plans | Done; see `52-edit-plan.md` |
| D-10, D-15 Neutral framing: a demonstration and reference project; goals written as capabilities to demonstrate | `README.md`; register item 93 |
| D-11 to D-14 Status vocabulary approved; statuses confirmed with `CUST-004` split; rewrite built specs to match the build; `WI-DEV-003` deleted | `docs/method/status-and-supersession.md`; the seven rewritten specs; `WI-CUST-007` |
| D-16 The sprint plan is Deferred, not Obsolete | `WI-PLAN-002`; lessons L-16 |
| D-17 Squash merge; push only a squashed branch | `docs/process/branching-strategy.md`; `docs/method/ai-collaboration.md` |

| Open decision | Outcome |
|---|---|
| R-01 to R-04 | Decided (above) |
| R-05 the project log | Folded into `docs/index.md` and `STATUS.md`; archived |
| R-06 the portfolio plan | Split into `scope.md`, `roadmap.md` and the README; archived |
| R-07 ADR consolidation | The numbered records stay; a by-concern index and a timeline were added. Merging related records into concern chapters was considered and not done (the ADR README notes it) |
| R-08 the licence | Register item 93 |
| R-09 plan documents | Merged into `demo-milestones.md`; `project-plan.md` stays the one phase view |
| R-10, R-11 history and the activity log | `docs/history/`; the log closed with a header note |
| R-12 peer copy-ins | Done in `docs/method/`; the register in this folder records each |
| R-13 the docs site | Register item 13 (wiring options and a review of the tool) |
| R-14 create the work items | Done as the gap-catalog specs; they are all Deferred |
| R-15 the project board | Register item 12 |
| R-16 mobile testing | `WI-QA-003` |
| R-17 product breadth documents | `WI-PROD-002`, `WI-PROD-003`, `WI-MGMT-003`, `WI-MGMT-006` |
| R-18 the review records | Moved here |
| R-19 cheap theory tests | Done: the baseline of 2026-10-30; the rest are in `WI-QA-002` and `WI-DEMO-001` |
| R-20 nothing unpublished reaches `main` | Push a squashed branch (lessons L-13); register item 93 |

## Facts that exist only outside the repository

The assistant's persistent working notes (how branches and pushes are handled, that findings go in the register, priorities, and the squashed-branch rule) are kept outside the repository. The conclusions that matter are in `docs/method/ai-collaboration.md`, `docs/process/branching-strategy.md` and `docs/product/backlog/current-plan.md`. The other repositories are unchanged.

## Not carried into live documents

The first-pass sampled findings that the full read overturned; the long lists of file-by-file dispositions already executed; and the discussion of the other repositories' own contents. They remain in the files of this folder.
