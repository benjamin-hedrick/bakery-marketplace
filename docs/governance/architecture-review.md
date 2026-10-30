# Architecture Review / Change Management

> **Status:** Current · rewritten 2026-10-30

How this project's architecture decisions (the ADRs in `docs/architecture/adr/`) are proposed, reviewed and revisited. The index of the decisions is `docs/architecture/adr/README.md`; the order they were made in is `docs/architecture/decision-timeline.md`.

## How a new ADR gets proposed

Anyone (a person or an AI assistant acting on the project) can propose a new ADR. Before drafting, assumptions and gaps are stated explicitly as a short list (context completeness, `docs/method/glossary.md`: the reviewer should not have to guess what the author assumed). This is the practice used for every ADR from 0002 onward, and it exists so a reviewer can redirect before a full draft is written, not after. One ADR covers one separable decision; if two decisions keep showing up together, that is a sign they should be split, not combined. The format is `docs/architecture/adr/template.md`.

**Acceptance:** an ADR moves from Proposed to Accepted once its Context, Decision, Consequences and Alternatives sections are complete and any hard trade-off has been explicitly checked with "is this a gap or an acceptable named compromise?", not just "does this look reasonable". The status line follows `docs/method/status-and-supersession.md`.

## How an existing ADR gets revisited

**Amend, don't rewrite, when the original decision still mostly holds.** The decision text is never edited. A dated note is appended at the bottom: an **Amendment note** when the decision's context or scope changes, a **Validation outcome** when a stated check has been run, a **Current reading** when the text is still right but a name or fact in it has moved on. ADR-0006 is the first precedent: when ADR-0008 (API Gateway) needed to interact with ADR-0006's auth model, ADR-0006 got a short amendment note at the bottom, not a rewritten Decision section. The original reasoning stays intact and citable; the new context is added where a reader would look for it. The status line then reads `Accepted, amended <dates>`.

**Supersede with a new ADR number when the original decision no longer holds.** The old ADR is marked `Superseded by ADR-N`, with a pointer to the one that replaces it, and is never edited to pretend the original reasoning was different than it was. ADR-0011 (React SPA) superseded by ADR-0012 (Next.js) is the example.

**What triggers a revisit:** a changed constraint (a business assumption changes), a failed assumption (something stated as a target turns out to be wrong once measured), or the **surprise rule** (`docs/method/glossary.md`), which has caught the most on this project: drawing a C4 diagram showed that a real architectural decision (the mapping of bounded contexts to services) had never been made, and that discovery was treated as the trigger to record it (ADR-0009), not a detail to patch over. Slice 1 did the same for stock ownership (ADR-0017) and service-to-service authentication (ADR-0018).

## Review cadence for shared reference documents

`docs/architecture/tech-stack.md` and `docs/architecture/nfrs.md` are audited for staleness **after every two or three related ADRs land, or at a project-plan phase boundary, whichever comes first**. This is not an arbitrary number: an audit happened after ADR-0002 and ADR-0003 landed, and again after ADR-0006 through ADR-0009, and both times the status markers had already gone stale by the time the audit was requested. The documentation reconciliation of October 2026 (`WI-PORT-006`) found the same drift again after ADR-0012 to ADR-0018, which is the evidence that waiting longer has a cost.

## What is out of scope here

- **Day-to-day code review:** `docs/process/engineering-standards.md` (PR guidelines, what a reviewer checks).
- **Business and scope decisions:** the guiding principles in `docs/product/vision.md`.
- **How the documentation method changes** (statuses, templates, the glossary): `docs/method/`.
