# WI-PORT-006 — Reconcile existing project artifacts with the accepted portfolio-slice decisions

```
WI ID:               PORT-006
Title:                Reconcile existing artifacts with ADR-0012 to ADR-0016
Type:                 Document/Artifact
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-ARCH-DOCS, EPIC-GOVERNANCE
Hat/Owner:            Architect (one named integrator; domain reviewers may advise)
Status:               In Progress — decision-level pass done 2026-10-26; document-content pass remaining
Size:                 M
```

**Priority:** Blocking for broad delegation; may run in parallel with the isolated SSR proof (`WI-PORT-001`).

## Goal

Make the existing repository consistent with the accepted portfolio decisions (ADR-0012 to ADR-0016) without erasing valid domain design or silently changing scope. This is the accountable task as well as the tracking item; the register below is its checklist.

## Method

Use the repo's existing reconciliation format: a dated `RECONCILIATION-DISPOSITIONS-YYYY-MM-DD.md` record in `docs/product/backlog/worklog/reconciliation/`. Don't start a parallel register. Historical work-item specs aren't rewritten. Superseded, adjusted, obsolete or cancelled items get a dated reconciliation note at the top, plus a matching note in `MASTER-BACKLOG-OUTLINE.md`.

1. Inspect the current branch and working tree; capture the baseline commit and the available build/test commands.
2. Read the current file and its linked ADR/backlog references before proposing a disposition.
3. For every candidate, record: current claim, disposition (`retain`, `amend`, `supersede`, `defer`; for backlog items also `adjusted`, `obsolete`, `cancelled`), rationale, authorizing decision, dependencies, exact file changes, reviewer/approver, and verification evidence.
4. Separate **decision conflicts** from **implementation-status corrections** and **documentation-only consistency fixes**.
5. Get approval for the change plan before edits. Implement in small reviewable commits/PRs; update links and indexes as needed.
6. Do not delete `.github/workflows/ci.yml` or claim Azure Pipelines is authoritative until ADR-0015's exit criteria are met.
7. Close only when every in-scope row has a disposition and verification. Unresolved rows stay explicitly deferred, with an owner and a trigger.

**Source-of-truth rules**: ADRs own decisions; plans (`docs/management/portfolio-slice/`) own the implementation approach; API/schema contracts own actual behavior; work items own task acceptance; `docs/ACTIVITY-LOG.md` records what happened. Avoid duplicate or contradictory copies.

## Pass 1 — decision level (done 2026-10-26)

Recorded in `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`: ADR-0012 to ADR-0016 accepted; ADR-0011 superseded; amendment notes on ADR-0002/0007/0008; ADR index and `tech-stack.md` updated; affected backlog items annotated; open-items register updated.

## Pass 2 — document content (remaining register)

> **Progress (2026-10-28):** the first row (`data-model-api-contracts.md`) is done: a "First-slice mapping" section holds the REST shapes and GraphQL schema draft moved from `first-slice-contract.md`, with a table of differences from the per-service shapes and dated notes on the preserved shapes. All other rows below are still open.

| File / area | What to check | Disposition to consider |
|---|---|---|
| `docs/architecture/data-model-api-contracts.md` | Existing domain entities/endpoints vs the first-slice API; separate authoritative C# REST/domain contracts from the client-facing GraphQL schema | Preserve the domain model; add an explicit mapping/contract section, using `WI-PORT-007`'s output |
| `docs/architecture/ddd/glossary.md`, `event-storming.md` | Names, state transitions, events, pickup/checkout language | Retain as the domain source; amend only for verified gaps |
| `docs/architecture/ddd/bounded-contexts.md`, ADR-0009 | BFF is a composition/presentation boundary, not a new domain owner | Usually retain; amend only where a precise clarification is needed |
| `docs/architecture/c4/context.md`, `container.md`, `capability-map.md` | Add the Next.js apps, BFF, Azure Pipelines and trace viewer; remove direct browser→service arrows and Static Web Apps; preserve domain boundaries | Update diagrams (`capability-map.md` likely retained unchanged) |
| ADR-0010, `BakeryMarketplace.slnx`, `tools/BakeryMarketplace.slnx` | .NET 8 runtime/framework vs actual project files; mixed package versions (finding B5, 2026-10-25) | Verify before changing; pin Node/package-manager versions for the new apps |
| `docs/architecture/nfrs.md`, `docs/process/engineering-standards.md`, `definition-of-ready.md`, `definition-of-done.md` | Test evidence, trace propagation, accessibility/security checks, AI-agent handoff, BFF latency budget | Amend only where missing; avoid duplicating existing standards |
| `docs/management/project-plan.md`, `docs/product/roadmap.md`, `LOCAL-MILESTONES.md`, `local-demo-execution-plan.md`, `portfolio-plan.md` | Milestone/sequence conflicts with the thin vertical slice; M3's `WEB-001` dependency | Reconcile the authoritative plan; mark old plans superseded where appropriate (pass 1 added notes to the M3 sections only) |
| `docs/management/budget-cost-estimate.md` | Static Web Apps $0 line no longer applies (ADR-0012); BFF + Next.js containers; Azure DevOps free tier | Amend once hosting (`INFRA-002`) is decided |
| `docs/index.md`, root `README.md`, `docs/project-log.md` | Navigation, current status, decision links | Update last, once destinations are stable |
| `docker-compose.yml` | Still an empty stub (open item #10) | Defer to `WI-DEV-002` (adjusted to include the BFF, Next.js and the trace viewer) |
| `infra/` | Terraform skeleton may look deployable when it isn't | Retain; label its status accurately |
| `apps/*`, `services/*`, `tools/*` | Actual implementation vs docs; runnable build/test commands; helper libraries to reuse | Inventory and test; don't rewrite working foundations to match the new plan |

## Acceptance criteria

- Every impacted source-of-truth document and implementation area has a register row.
- Each row has a disposition, rationale, decision reference, and verification or an explicit deferral.
- This item is linked from `MASTER-BACKLOG-OUTLINE.md` and `EPIC-PORTFOLIO-SLICE.md`.
- Existing work-item IDs and dependencies are not duplicated or silently renumbered.
- No code, ADR or historical record is changed before the pass's change plan is approved.
- The final handoff summarizes changes, deferred items, checks run, and contradictions discovered.

## Out of scope

Implementing the vertical slice, or choosing unresolved business behavior without review.
