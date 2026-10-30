# Reorganization plan (draft for approval, 2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Moves, merges, splits and removals, with the conditions under which each may happen. Nothing here has been done. Counts of inbound references come from `git grep` on 2026-10-29 (documents only, excluding the review's own files).

## Rules

1. **A document moves to `docs/history/` only when** (a) its status is recorded as Done, Superseded, Obsolete or Historical in the status table (`T-08`), (b) any live content it still carries has been lifted into a current document, and (c) its inbound links have been rewritten. Until the status table exists, nothing is archived: the answer to "is status tracked on those?" is **not yet**. Work-item headers, outline icons and epic roll-ups disagree (record `20`), so archiving by those would archive on guesses.
2. **History is moved, not edited.** Archived files keep their text; only a one-line banner (`Status: Historical`, where the live replacement is) is added at the top.
3. **Folders stay where they are for live material.** What moves is the *instances* that are finished (packets, worklogs, the September batch and plan documents), not the live backlog.
4. **Peer references are removed** wherever bakery documents point to `peer-A` (16 files) or `peer-B` (3 files), by inlining what matters or deleting the pointer.
5. **Every move or removal is one commit** with the link check (`T-09`) run before and after.

## Target tree (additions marked +, removals marked -, moves marked →)

```
docs/
  index.md                      (rewritten)
  method/                    +  new: README, status-and-supersession, glossary, work-item-template,
                                ai-collaboration, reconciliation, lessons, decisions-and-governance, checklists
  product/
    vision.md, personas.md, roadmap.md, okrs.md          (roadmap, okrs rewritten)
    demo-milestones.md       +  merged from LOCAL-MILESTONES.md and local-demo-execution-plan.md
    backlog/
      README.md                                          (rewritten)
      current-plan.md        +  split from MASTER-BACKLOG-OUTLINE.md (On Deck, next work, status summary)
      epic-catalog.md           (the outline's epic sections, kept as the catalog)
      STATUS.md              +  generated status table
      EPIC-*.md, WI-*.md                                 (banner only; DEV-003 removed or replaced)
      docs/history/sept-2026-delegation/    →  history/sept-2026-delegation/
      worklog/               →  history/worklogs/
      BATCH-5-CURATION.md, RECONCILIATION-2026-09-28.md, PARKING-LOT.md   → history/planning-sept-2026/
  architecture/
    adr/ (template.md only; 0000-template.md -)          (README rewritten with status column)
    patterns.md              +   decision-timeline.md +   api/ +   diagrams (rewritten container, request path, component)
  process/                       (+ test-strategy.md)
  operations/                    (runbooks/ and postmortems/ get real files)
  governance/
    open-items-register.md                               (+ Status field)
    architecture-review.md                               (rewritten)
    doc-review/, doc-reconciliation-ledger, peer-copy-in-register   → history/review-2026-10/   (when the review is closed)
  management/                    (risk register, budget updated)
  evidence/                      (+ README index)
  history/                   +  README (why this is kept), ACTIVITY-LOG.md, sept-2026-delegation/, worklogs/,
                                planning-sept-2026/, review-2026-10/
README.md                        (rewritten)
local-demo-execution-plan.md  →  history/planning-sept-2026/   (root file removed)
CLAUDE.md                        (corrected, approved)
.claude/CLAUDE.md             -  (empty)
tools/event-schemas/, tools/logging-helper/  -  (empty folders)
```

## Moves (into `docs/history/`)

| From | To | Condition before moving | Inbound references now |
|---|---|---|---|
| `docs/history/sept-2026-delegation/` (9 files) | `docs/history/sept-2026-delegation/` | Packets 01 to 07 recorded Historical in `STATUS.md`; the "origin of the lesson" paragraph for packet 05 lifted into `method/ai-collaboration.md` | 2 |
| `docs/product/backlog/worklog/` (7 files, including the two dispositions records) | `docs/history/worklogs/` (keep the two dispositions records in `docs/product/backlog/reconciliation/`, because they are live method evidence and the plans cite them) | Worklog statuses swept; V2 disposition note added (lead's disposition, 2026-10-29); live items (BAK-012, BAK-014, STD-002/003/004) lifted into the next-phases plan | 24 |
| `docs/history/planning-sept-2026/BATCH-5-CURATION.md` | `docs/history/planning-sept-2026/` | Items `PREF-001/002`, `VEN-001/002` carry their own status | 2 |
| `docs/history/planning-sept-2026/RECONCILIATION-2026-09-28.md` | `docs/history/planning-sept-2026/` (its dispositions stay live) | Closing pointer to its dispositions record | 1 |
| `docs/product/backlog/PARKING-LOT.md` | `docs/history/planning-sept-2026/` | The three live items (APIM versioning, refresh token = register 24, shared package) moved to the register | 16 |
| `local-demo-execution-plan.md` (repo root) | `docs/history/planning-sept-2026/` | `docs/product/demo-milestones.md` exists | 5 |
| `docs/history/ACTIVITY-LOG.md` | `docs/history/ACTIVITY-LOG.md` | The log is closed (header note); `CLAUDE.md` and `mkdocs.yml` references updated | 21 |
| `docs/governance/doc-review/`, ledger, copy-in register | `docs/history/review-2026-10/` | The review is closed and its findings are dispositioned; scrub internal and peer material first (public-readiness) | 0 |

## Merges and splits

| What | Into | Notes |
|---|---|---|
| `LOCAL-MILESTONES.md` + `local-demo-execution-plan.md` | `docs/product/demo-milestones.md`: one table, one row per milestone (M1 to M5), status, "how to run it" column, evidence link, gap | Fixes ledger P-8; replaces two of the five overlapping trackers. `project-plan.md` phases stay (phase-level) and link here |
| `MASTER-BACKLOG-OUTLINE.md` (429 lines) | Split into `current-plan.md` (short, kept fresh: what is built, what is next, link to `STATUS.md`) and `epic-catalog.md` (the epic sections, status columns generated or removed) | The queue, batches and gaps 1 to 9 move to history as sections of a snapshot file |
| `docs/project-log.md` | Fold into `docs/index.md` (what exists, where) and `STATUS.md` (per-artifact status); then archive | The log duplicates both; its "start here" role in `CLAUDE.md` and `engineering-standards.md` is re-pointed |
| `data-model-api-contracts.md` | **Split**: an as-built API reference (generated from services, `T-25`) and a target model (the per-service containers and events not yet built) | Keeps the first-slice mapping section where it is |
| `tech-stack.md` | Rewritten in place (Confirmed versus Built/Verified columns, versions) | `T-29` |
| `adr/README.md` | Rewritten with a status column and complete amendment list | |

## Removals

| What | Why | Needs |
|---|---|---|
| `docs/architecture/adr/0000-template.md` | Byte-identical to `template.md` (1 reference, in the ADR README) | Approved |
| `.claude/CLAUDE.md` | Empty tracked file; the real file is the root `CLAUDE.md` | Approved with `CLAUDE.md` |
| `tools/event-schemas/`, `tools/logging-helper/` | Empty folders with a README each; the libraries are `BakeryMarketplace.EventSchemas` and `.Logging` | Approved |
| `docs/product/backlog/WI-DEV-003.md` | Duplicate of `WI-DEV-004.md` under an old ID; the outline's `DEV-003` is the Stripe CLI item (title-only) | **Pending lead's decision.** Recommendation: delete, and say in the outline that `DEV-003` has no spec yet (2 references to fix) |

## Link and reference clean-up (done as part of each step)

- **Peer references (19 files):** `ACTIVITY-LOG` (history, left as is with the history banner), `adr/0009`, `ddd/event-storming`, `governance/architecture-review`, `governance/open-items-register` (item 19), `management/risk-register`, `process/definition-of-ready`, `process/engineering-standards`, the outline, `PARKING-LOT`, `backlog/README`, `WI-CACHE-001`, `WI-EVT-001`, `WI-GOV-001`, the worklog coordination copy, `project-log`. For spec files (`WI-*`), the pointer is deleted or replaced by the bakery document that carries the same content once `method/` exists; spec bodies are otherwise not edited, so for `WI-CACHE-001`, `WI-EVT-001`, `WI-GOV-001` the change is a single reference swap inside the Inputs line, flagged in the commit.
- **`mkdocs.yml`:** nav rebuilt for the new tree (adds method, history, status, evidence index, quality gates, local dev); `docs_dir` excludes `history/` from the nav but keeps it reachable.
- **`README.md` and `portfolio-plan.md`:** links updated; `portfolio-plan.md` sits outside `docs_dir`, so the site links to it through a copy or the README (decision needed).

## Risks and how they are handled

| Risk | Handling |
|---|---|
| Broken links after moves (24 + 21 + 16 inbound references) | `T-09` link check before and after each commit; rewrite in the same commit |
| Rewriting history by accident | Moves are `git mv`; archived text unchanged except a one-line banner; commit messages say so |
| The generated status table disagrees with the lead's view | The proposed statuses are listed for approval in `52`, with the dozen ambiguous cases called out |
| Shared files edited in parallel (outline, register, `mkdocs.yml`, `CLAUDE.md`) | One owner at a time, per `07-shared-file-ownership`; sequence in `52` |
| Public exposure of internal material | The review files and peer names are scrubbed or archived before any public decision (`T-05`) |

## Not changed

Live ADRs and their numbers; `first-slice-contract.md`, `order-lifecycle.md`, `quality-gates.md`, `slice-1/*`, the evidence snapshots; the 67 specs' bodies; the reconciliation-dispositions records.
