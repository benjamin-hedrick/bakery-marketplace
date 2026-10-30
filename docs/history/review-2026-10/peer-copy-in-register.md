# Peer copy-in register (working document, started 2026-10-29)

> **Status:** Historical · moved 2026-10-30 from `docs/governance/`. A working record of the October 2026 documentation review. Its findings are dispositioned in [`closing-record.md`](closing-record.md) and the live gap catalog (`docs/product/backlog/gap-catalog/`). The text is unchanged except that the names of three other repositories are replaced by labels (peer-A: a process framework; peer-B: an AI collaboration playbook; peer-C: an older playbook) and that references to files that moved were re-pointed. Relative links in it no longer work.

Tracks every file of the three peer repositories read in the 2026-10-29 review (`peer-A`: 34 files, `peer-B`: 30, `peer-C`: 7), what value it holds, whether bakery already demonstrates it, and what to do. It exists so the bakery reconciliation can cross-check each item as it reaches the matching bakery document, and so nothing of value is lost or copied twice.

**Internal working document.** It names the peer repositories, which bakery documents will not do (decision of 2026-10-29: no links or references to the peers; bakery carries its own as-used copies). Archive or remove this file, the ledger and register items that name the peers before the repository is made public.

## Dispositions

| Code | Meaning |
|---|---|
| **COPY** | Value bakery does not yet show. Adapt and add to bakery as its own as-used document, in bakery's voice, no link back. |
| **EVIDENCE** | Bakery already does this. Document what bakery does (with its own citations); nothing to copy. |
| **COMPARE** | Bakery has its own version. Read both during the pass; fold in anything missing. |
| **SKIP** | Peer-only machinery, method research, history, or something bakery applies without restating (the Agile-manifesto rule). |
| **RETIRE** | Obsolete. |

Status: **Proposed** (disposition suggested, not yet confirmed by the human lead), **Confirmed**, **Done** (added to bakery, with path). All start as Proposed.

## peer-A (34 files)

| ID | Source | Value | In bakery now? | Disp. | Bakery target (check when reached) | Status |
|---|---|---|---|---|---|---|
| CI-01 | `templates/work-item-template.md` | Epic and work-item shape, categorized references, "you do not need to know", open points, AI suitability | **No template file in bakery.** 67 specs follow it, and `backlog/README` points to the external repo for it | COPY | `docs/product/backlog/` or `docs/method/` (with bakery's own status vocabulary, ledger P-11) | Proposed |
| CI-02 | `templates/technology-decision-checklist.md` | Run-once early checklist: security posture, build vs buy, cost tier, extensibility, decomposition, local dev | Outcomes exist (NFRs, ADRs, tech stack); no checklist artifact | COPY | `docs/method/` or `docs/process/` | Done: `docs/method/decision-checklists.md` (one document, both checklists, filled in retrospectively) |
| CI-03 | `templates/business-decision-checklist.md` | Scope, legal, monetization, stakeholders, success criteria | Not present (ToS/privacy scope is an open decision `GOV-002`) | COPY | `docs/method/` or `docs/process/` | Done: `docs/method/decision-checklists.md` (one document, both checklists, filled in retrospectively) |
| CI-04 | `exploration/governance/process-improvement-lessons-log.md` (PI-001 to 007) | Lessons-log format; bakery now holds evidence for several lessons | Evidence exists (`docs/evidence/test-reliability/`, slice findings); no lessons record | COPY (format) + fill | `docs/method/lessons.md` (verdicts with bakery citations) | Done: `docs/method/lessons.md` (18 entries; the format is bakery's own) |
| CI-05 | `exploration/governance/permit-to-build-template.md` | Authorization-before-build record | Substance done informally (ADR-0017, lifecycle approval) | COPY + fill once | `docs/method/` (one retrospective example) | Skipped by the lead 2026-10-30 (same substance is in the ADRs and the slice evidence; lessons L-06) |
| CI-06 | `exploration/governance/permit-to-operate-template.md` | Evidence-before-operate record | Slice-1 findings are such a pack in substance | COPY + fill once | `docs/method/` (one retrospective example) | Skipped by the lead 2026-10-30 (same substance is in the ADRs and the slice evidence; lessons L-06) |
| CI-07 | `exploration/governance/architecture-governance-exploration.md` | Decision authority (role, decision maker, AI contribution); what needs review; exceptions; revisit triggers | `CLAUDE.md` "Human approval required"; `docs/governance/architecture-review.md` | COMPARE, COPY condensed | `docs/governance/architecture-review.md`, `docs/method/` | Proposed |
| CI-08 | `domains/software-systems/architecture-patterns.md` | Adapter/fallback/chaos, deploy-time vs runtime toggles, eliminate-a-secret, ACL for deferred scope, buy vs build, modular monolith | Patterns are in ADRs 0002 to 0009, not gathered in one page | COPY (adapt, add bakery's own new patterns: outbox, spent idempotency key, final released reservation, BFF composition, gated test hooks, real-stack acceptance) | `docs/architecture/` patterns page | Done: `docs/architecture/patterns.md` |
| CI-09 | `core/context-completeness.md` | Two ideas, to be written separately (lead, 2026-10-30): **context completeness** is proactive and about working process, especially delegated work (it varies with repository access, human or AI capability and skill, and ability to plan, across plan, delegate, implement, review and refine); the **surprise rule** is the reactive response in any phase; the document's front-loaded checklists are the preventive half (see CI-03, CI-04). Implicit decisions by early action | Practised: the register rule, and the sold-out and spent-key episodes | EVIDENCE + COPY rule text | `docs/method/` | Done: `docs/method/context-completeness.md`, `surprise-rule.md` (the checklists are CI-02 and CI-03) |
| CI-10 | `core/phase-sequence.md`, `core/checklists.md` | Phases and per-phase checklists | Bakery followed the arc; Phase 8 is now partly real | EVIDENCE (as-used account), COPY condensed checklists only if wanted | `docs/method/` ("how a phase ran in bakery"), README narrative | Done: "How the phases ran" in `docs/architecture/decision-timeline.md` |
| CI-11 | `core/artifact-roles.md` | Hats and scope-status legend | `portfolio-plan.md` uses MVP / MVP-lite / Deferred and role sections | COMPARE | `portfolio-plan.md`, `docs/method/` | Proposed |
| CI-12 | `domains/software-systems/artifact-catalog-template.md` | Role-by-artifact list | `portfolio-plan.md` section 1.2 is the instance; **no Quality / Test role** | COMPARE; COPY a Quality/Test section | `portfolio-plan.md` or `docs/method/` | Proposed |
| CI-13 | `domains/software-systems/adr-template.md` | ADR sections and four "practices that made it work" | `docs/architecture/adr/template.md` (and a duplicate `0000-template.md`) | COMPARE; COPY the practices paragraph | `docs/architecture/adr/README.md` | Proposed |
| CI-14 | `governance/architecture-review-template.md` | Empty prompts | `docs/governance/architecture-review.md` | COMPARE | same | Proposed |
| CI-15 | `templates/parking-lot-template.md` | Transient items vs register | `PARKING-LOT.md` (stale) and the register | EVIDENCE | `docs/product/backlog/PARKING-LOT.md` | Proposed |
| CI-16 | `templates/activity-log-template.md` | Reverse-chronological log | `docs/history/ACTIVITY-LOG.md`, **paused** (parallel-branch conflicts) | EVIDENCE (record the lesson) | `docs/method/` | Proposed |
| CI-17 | `discovery/README.md` | Try-then-promote rule | No equivalent rule | SKIP (generalization layer) unless bakery needs a promotion rule for its own docs | n/a | Proposed |
| CI-18 | `case-studies/bakery-marketplace.md` | Process meeting reality | Frozen at the planning phase | EVIDENCE: write bakery's own account | `docs/method/` | Done in part: `ai-collaboration.md` and the README |
| CI-19 | `exploration/artifact-landscape/*` (2 files) | Research method for artifact tailoring | Not demonstrated | SKIP | n/a | Proposed |
| CI-20 | `exploration/worklog/*` (6 files, about 2,000 lines) | Coordination history | Bakery holds its own copies (`docs/product/backlog/worklog/`) | SKIP; bakery copies to archive (ledger P-10, F-4); V2 deferral note (F-5) | `docs/product/backlog/worklog/` | Proposed |
| CI-21 | `methodologies/agile.md`, `togaf.md`, `safe.md` | Mapping notes | Bakery applies the practices | SKIP (the rule: apply the practice, do not restate it) | n/a | Proposed |
| CI-22 | `README.md`, `domains/README.md`, `domains/software-systems/README.md`, `templates/README.md`, `exploration/artifact-landscape/README.md` | Peer navigation | n/a | SKIP | n/a | Proposed |

## peer-B (30 files)

| ID | Source | Value | In bakery now? | Disp. | Bakery target | Status |
|---|---|---|---|---|---|---|
| CI-30 | `handoff-integrity.md` | Three failure modes with rules (stale spec, ID collisions, status as a stated fact) | Bakery had all three incidents (packet 05, `WI-DEV-001`, `WI-AUTH-005`); no rule document | COPY (in bakery's voice, with its own incidents) | `docs/method/` | Done: `docs/method/ai-collaboration.md` |
| CI-31 | `context-efficiency.md` | Footprint, stop-and-flag, pointer ceiling, recursive scope | Not stated; `CLAUDE.md` has "before expanding scope" | COPY | `docs/method/` | Done in part: stop-and-flag in `ai-collaboration.md` |
| CI-32 | `delegation-packet-levels.md`, `-lifecycle.md`, `-review-checklist.md`, `-authoring-guide.md`, `-level-1/2/3-template.md` | Packet system | Seven Sept packets exist, without levels; slice 1 did not use packets | COPY condensed, mark levels 2 and 3 as defined and not exercised | `docs/method/` and `docs/history/sept-2026-delegation/` | Done in part: packets summarized in `ai-collaboration.md` |
| CI-33 | `project-seed-kit.md`, `PROJECT-AI-CONVENTIONS-TEMPLATE.md` | Conventions file for a project | **`CLAUDE.md` is the realized instance** (plus rules the template lacks) | COMPARE; EVIDENCE; fold missing baseline rules into `CLAUDE.md` with the lead's approval | `CLAUDE.md`, `docs/method/` | Done in part: `CLAUDE.md` described in `ai-collaboration.md` |
| CI-34 | `prompting-patterns.md`, `workflow-discipline.md`, `context-management.md` | Working style with the assistant | Practised in these sessions; not written as bakery conventions | COPY condensed (what works in this repo) | `docs/method/` AI-collaboration record | Done: working conventions in `ai-collaboration.md` |
| CI-35 | `cross-repo-parking-lot.md` items: hard invariant vs guided default; two axes of "local fallback"; standards modules | Authoring pattern; precise language for adapters | `CLAUDE.md` and quality gates mix both without naming it; ADR-0002/0003/0004 use "fallback" for both | COPY (patterns) | `docs/method/`, `docs/architecture/` patterns page | Done: `docs/method/rule-authoring.md` and "Two meanings of fallback" in `docs/architecture/patterns.md` |
| CI-36 | `open-questions.md` | Open questions about agents, RAG, skills | Answerable from bakery (ledger G-7) | COPY answers | `docs/method/` | Done: questions answered in `ai-collaboration.md` |
| CI-37 | `continuity/portfolio-continuity-audit.md`, `continuity/README.md` | Durable IDs, routing, session closure | Practised as WI IDs, register, evidence, commit rule | EVIDENCE (document practice); audit itself SKIP | `docs/method/`, `docs/process/` | Done in part: records and sessions in `ai-collaboration.md` |
| CI-38 | `delegation/delegation-task-v0.1.md`, `delegation/renderer-rules-v0.1.md` | Experimental just-in-time rendering of a task from a work item | Not exercised | SKIP now; revisit as future work | n/a | Proposed |
| CI-39 | `case-studies/bakery-marketplace.md` | Planning-phase examples of the prompting patterns | Same story as CI-18 | EVIDENCE | `docs/method/` | Done in part: `ai-collaboration.md` |
| CI-40 | `playbook-backlog.md`, `ACTIVITY-LOG.md`, `README.md`, `worklog/*` (5 files) | Peer maintenance and history | n/a | SKIP | n/a | Proposed |

## peer-C (7 files)

| ID | Source | Value | Disp. | Bakery target | Status |
|---|---|---|---|---|---|
| CI-50 | whole repo (superseded by the other two; templates byte-identical) | One unique paragraph: staging techniques (hypothetical team, staged incident) are real practice, not "fake project" tricks | RETIRE; COPY the paragraph | `docs/method/` | Done: staged artifacts paragraph in `ai-collaboration.md` |

## Bakery-side findings from building this register

| # | Finding |
|---|---|
| CI-X1 | `.claude/CLAUDE.md` is tracked and **empty** (0 lines); the real file is the root `CLAUDE.md`. Remove or explain. Editing `CLAUDE.md` needs the lead's approval. |
| CI-X2 | Bakery has no copy of the work-item template, the two decision checklists, a status vocabulary or a lessons record, but depends on all four in practice. These are the highest-value copy-ins (CI-01 to CI-04). |
| CI-X3 | Where things land: copy-ins go to `docs/method/`, `docs/process/`, `docs/architecture/` or (with the lead's approval) `CLAUDE.md`. Counts by disposition are not stated here; they are derived from the tables when the register is reviewed, to avoid a stale total. |


## Source versions (so every copy-in can be retrieved exactly)

The peer repositories were read at these commits on 2026-10-29 and were not modified by the review (`git status` clean in all three). Retrieve any source with `git -C <repo> show <commit>:<path>`; the paths in the tables above are relative to each repository root.

| Repository | Local path | Commit read | Files |
|---|---|---|---|
| peer-A | `peer-A` | `504bd7a` (2026-10-25) | 34 |
| peer-B | `C:\git\peer-B` | `cf01355` (2026-10-25) | 30 |
| peer-C | `C:\git\peer-C` | `7b52da1` (2026-09-05) | 7 |

The substance of what to copy is in the register rows (value, disposition, bakery target). The full text of the sources (for example `templates/work-item-template.md`, the two decision checklists, `handoff-integrity.md`, the delegation-packet templates, the permit templates) has **not** been copied into this repository: copying is the task of the edit plan's Step 11, after the lead confirms the register (decision R-12 in `doc-review/60-resume-here.md`). If the peer repositories move or change before then, restore the versions above from their git history.
