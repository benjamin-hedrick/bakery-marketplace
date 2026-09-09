# Architecture Review / Change Management

**Scope note, stated up front since it's easy to conflate**: this document governs how *this project's own architecture decisions* (the ADRs in `docs/architecture/adr/`) get proposed, reviewed, and revisited. It is **not** the same as `project-process-framework/discovery/README.md`, which governs how the *reusable process framework itself* evolves. Both exist because a change to "how we decide things here" and a change to "how we decide things on any future project" are genuinely different questions — this project doesn't rewrite the framework, and the framework doesn't dictate this project's specific technical calls.

## How a new ADR gets proposed

Anyone (a person or an AI assistant acting on the project) can propose a new ADR. Before drafting, assumptions and gaps are stated explicitly as a short list — this is the practice used for every ADR from 0002 onward, and it exists specifically so a reviewer can redirect before a full draft is written, not after. One ADR covers one genuinely separable decision; if two decisions keep showing up together, that's a sign they should be split, not combined (see `project-process-framework/domains/software-systems/adr-template.md`).

**Acceptance**: an ADR moves from Proposed to Accepted once its Context, Decision, Consequences, and Alternatives sections are complete and any hard tradeoff has been explicitly checked with "is this a gap or an acceptable named compromise?" — not just "does this look reasonable."

## How an existing ADR gets revisited

**Amend, don't rewrite, when the original decision still mostly holds.** ADR-0006 is the concrete precedent: when ADR-0008 (API Gateway) needed to interact with ADR-0006's auth model, ADR-0006 got a short **Amendment note** at the bottom, not a rewritten Decision section. The original reasoning stays intact and citable; the new context is added where a reader would look for it.

**Supersede with a new ADR number when the original decision no longer holds.** The old ADR is marked Superseded, with a pointer to the one that replaces it — never edited to pretend the original reasoning was different than it was.

**What triggers a revisit**: a changed constraint (a business assumption changes), a failed assumption (something stated as a target turns out to be wrong once measured), or — the mechanism that's actually caught something real on this project — the **"surprise as a trigger" rule** (`project-process-framework/core/context-completeness.md`). ADR-0009 is the direct example: drawing a C4 diagram surfaced that a real architectural decision (bounded-context-to-service mapping) had never actually been made, and that discovery itself was treated as the trigger to formalize it, not a detail to quietly patch over.

## Review cadence for shared reference documents

`docs/architecture/tech-stack.md` (and similarly, `docs/architecture/nfrs.md`) gets audited for staleness **after every 2-3 related ADRs land, or at a project-plan phase boundary, whichever comes first** — this isn't an arbitrary number, it's what's actually happened so far: an audit happened after ADR-0002/0003 landed, and again after ADR-0006 through ADR-0009. Both times, status markers had already gone stale by the time the audit was requested — waiting longer than this has a demonstrated cost, not just a theoretical one.

## What's explicitly out of scope here

- **Day-to-day code review** — that's `docs/process/engineering-standards.md`'s job (PR guidelines, what a reviewer checks)
- **Business/scope decisions** — that's `docs/product/vision.md`'s guiding principles and the business-decision-checklist's job, not an architecture concern
- **Changes to `project-process-framework` itself** — see the scope note at the top; that's `discovery/README.md`'s promotion criteria, a different repo with a different audience
