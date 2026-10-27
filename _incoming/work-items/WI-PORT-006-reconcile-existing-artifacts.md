# WI-PORT-006 — Reconcile existing project artifacts with accepted portfolio decisions

**Status:** Proposed; required before broad implementation delegation  
**Type:** Architecture/documentation coordination  
**Owner:** One named integrator for the reconciliation pass; domain reviewers may advise.  
**Priority:** Blocking for broad delegation; may run in parallel with the isolated SSR proof.

## Goal

Create an approved, file-by-file change plan that makes the existing repository consistent with accepted portfolio decisions without erasing valid domain design or silently changing scope. This is a tracking item as well as the work itself; do not treat the register alone as completed reconciliation.

## Required workflow

1. Inspect the current branch and working tree; capture the baseline commit and available build/test commands.
2. Read the current file and its linked ADR/backlog references before proposing a disposition.
3. For every candidate, record: current claim, proposed disposition (`retain`, `amend`, `supersede`, `defer`), rationale, authorizing decision, dependencies, exact file changes, reviewer/approver, and verification evidence.
4. Separate **decision conflicts** from **implementation-status corrections** and **documentation-only consistency fixes**.
5. Obtain approval for the change plan before edits. Implement in small reviewable commits/PRs; update links and indexes as needed.
6. Do not delete `.github/workflows/ci.yml` or claim Azure DevOps is authoritative until the ADO pipeline runs successfully and required checks have migrated.
7. Close only when each in-scope register row has a disposition and verification; unresolved rows remain explicitly deferred with an owner and trigger.

## Initial reconciliation inventory

This is a starting inventory, not a claim that every listed file is wrong. Inspect related references and expand the list if the repo reveals additional dependencies.

| File / area | What to check | Initial disposition to consider |
|---|---|---|
| `docs/architecture/adr/0011-frontend-framework.md` | React/Vite + Static Web Apps decision vs proposed Next.js Pages Router SSR + Relay; identify whether a new superseding ADR is required rather than silently rewriting history | Amend/supersede only after proof and approval |
| `docs/architecture/tech-stack.md` | Frontend, GraphQL/BFF, runtime versions, observability, pipeline and hosting claims | Amend after decisions are accepted and validated |
| `docs/architecture/data-model-api-contracts.md` | Existing domain entities/endpoints vs first-slice API; separate authoritative C# REST/domain contracts from client-facing GraphQL schema | Preserve domain model; add explicit mapping/contract section |
| `docs/architecture/ddd/glossary.md` and `event-storming.md` | Names, state transitions, events, pickup/checkout language | Retain as domain source; amend only for verified gaps |
| `docs/architecture/ddd/bounded-contexts.md`, `docs/architecture/adr/0009-bounded-context-service-mapping.md` | Keep business ownership in C# services; clarify BFF is composition/presentation boundary, not a new domain owner | Usually retain; amend only where precise clarification is needed |
| `docs/architecture/adr/0002-cache-strategy.md` and `docs/product/backlog/EPIC-CACHING.md`, `WI-CACHE-*` | Existing cache provider / Redis decisions vs three distinct layers (server/data source, Relay normalized store, HTTP/browser/CDN); invalidate ownership and scope of any older cache work | Reconcile carefully; do not imply existing Redis abstractions are removed without an explicit decision |
| `docs/architecture/adr/0008-api-gateway.md` | APIM's role for service APIs vs browser-to-GraphQL BFF path | Clarify path boundaries; do not assume GraphQL must be exposed through APIM without deciding |
| `docs/architecture/c4/context.md`, `container.md`, `docs/architecture/capability-map.md` | Diagram accuracy after adding Next.js/BFF and pipeline/telemetry; preserve domain boundaries | Update diagrams after boundary is accepted |
| `docs/architecture/adr/0010-service-language-framework.md` and `BakeryMarketplace.slnx` | C# service runtime/framework versions and current solution/build layout | Verify against actual project files before changing |
| `docs/architecture/nfrs.md`, `docs/process/engineering-standards.md`, `definition-of-ready.md`, `definition-of-done.md` | Add test evidence, trace propagation, accessibility/security checks and AI-agent handoff only where missing | Amend if necessary; avoid duplicating existing standards |
| `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`, `README.md`, `WI-WEB-001.md`, `EPIC-WEB-CUSTOMER.md`, `EPIC-CACHING.md`, `WI-ARCH-*`, and `delegation-packets/*` | Existing backlog IDs, scope, dependencies, and previously prepared agent packets; avoid parallel/conflicting work and preserve settled decisions | Cross-link, supersede, or defer explicitly; don't create competing source of truth |
| `docs/management/project-plan.md`, `docs/product/roadmap.md`, `docs/product/backlog/LOCAL-MILESTONES.md`, `local-demo-execution-plan.md`, `portfolio-plan.md` | Milestone/sequence conflicts with the new thin vertical slice and technology proof | Reconcile the authoritative plan and mark old plans superseded if appropriate |
| `docs/index.md`, root `README.md`, `docs/architecture/adr/README.md` | Navigation, current status, and decision links | Update last, once destinations are stable |
| `.github/workflows/ci.yml`, proposed Azure DevOps YAML, `infra/`, `docker-compose.yml` | Actual executable state, secrets/OIDC assumptions, deployability, local dependencies | Verify before labeling operational; preserve GitHub as source control; migrate checks before removing old CI |
| `apps/*`, `services/*`, `tools/*`, tests and project files | Actual implementation vs docs; runnable build/test commands; existing tests and helper libraries that should be reused | Inventory and test; don't rewrite working foundations just to match a new plan |

## Acceptance criteria

- The reconciliation register is complete enough to identify every impacted source-of-truth document and implementation area.
- Each row has an explicit disposition, rationale, decision reference, and verification or an explicit deferral.
- A dedicated backlog item tracks this work and is linked from the master backlog/index.
- Existing work-item IDs and their dependencies are not duplicated or silently renumbered.
- No code, ADR, or historical record is changed before the change plan is approved.
- Final handoff summarizes changes, deferred items, checks run, and contradictions discovered.

## Out of scope

This item does not implement the vertical slice, choose unresolved business behavior without review, or treat proposed ADR drafts as accepted merely because they exist.
