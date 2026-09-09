# Project Plan (Execution-Level)

Distinct from `portfolio-plan.md` (scope, MVP-line legend, artifact ownership) and `MASTER-BACKLOG-OUTLINE.md`'s Suggested Build Order (epic sequencing). This document is the phase/milestone view a lead would actually track progress against — it references those two rather than restating them.

**Sequencing is relative, not calendar-dated** — phases are ordered "this before that," not scheduled to specific dates. Actual pace depends on available hours/week, which hasn't been decided; adding fabricated dates here would be worse than no dates at all. See `WI-MGMT-001`'s Open Points.

## Current status

**Phase 0 is complete. Phase 6 (artifact epics) is partially underway, running in parallel per the Suggested Build Order's own note that these "aren't blocked by build progress." Everything else is not started.** Sourced from `docs/ACTIVITY-LOG.md` and `docs/project-log.md` — if this ever drifts from those two, trust them, not this summary.

## Phase 0 — Planning & Architecture *(Done)*

**Objective**: establish vision, domain model, and every foundational architecture decision before any code is written.
**Entry criteria**: none — this is the starting phase.
**Exit criteria**: vision, bounded context map, glossary, and all foundational ADRs accepted.
**Status**: Done — vision, bounded context map, glossary, ADR-0001 through ADR-0009, NFRs, C4 diagrams (context + container), and the SLA/SLO doc are all complete.

## Phase 1 — Foundational / Cross-Cutting Build

**Objective**: build the shared infrastructure every domain feature depends on.
**Constituent epics**: `EPIC-CACHING`, `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`.
**Entry criteria**: Phase 0 complete (satisfied).
**Exit criteria**: every interface named in these epics (`CacheProvider`, `EventPublisher`/`EventSubscriber`, `Repository<T>`, auth middleware) is defined and contract-tested; local dev environment can actually run.
**Status**: Not started.

## Phase 2 — Core Domain Slice

**Objective**: the walking-skeleton path — enough to demo idea-to-order end-to-end.
**Constituent epics**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY`.
**Entry criteria**: Phase 1's interfaces exist (services can be built against something real, not a stub).
**Exit criteria**: a customer can browse, customize, order, and see it reflected on the live queue display, end-to-end, locally.
**Status**: Not started.

## Phase 3 — Remaining Domain Epics

**Constituent epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`.
**Entry criteria**: Phase 2's walking skeleton works.
**Exit criteria**: full MVP feature set (per `portfolio-plan.md`'s MVP line) is functionally complete.
**Status**: Not started.

## Phase 4 — Delivery Infrastructure

**Constituent epics**: `EPIC-LOCAL-DEV`, `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`.
**Entry criteria**: can start in parallel with Phase 2/3 once Phase 1 is done — not strictly sequential.
**Exit criteria**: a real deploy pipeline exists; `docker-compose up` reflects the actual architecture, not the current stub.
**Status**: Not started.

## Phase 5 — Quality / Hardening

**Constituent epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY`.
**Entry criteria**: can run partly in parallel with Phase 3, per the Suggested Build Order.
**Exit criteria**: each epic's items are addressed to at least MVP-lite level.
**Status**: Not started.

## Phase 6 — Remaining Artifact Epics *(In Progress, Parallel)*

**Constituent epics**: `EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`.
**Entry criteria**: none — explicitly parallel to everything else, not blocked by build progress.
**Exit criteria**: every artifact in `docs/project-log.md`'s by-hat tables is ✅, not 🟡/⬜.
**Status**: In progress — `NFR-001`, `ARCH-001` (C4), `OPS-001` (SLA/SLO) done; this document and the risk register (`MGMT-001`/`MGMT-002`) are the current work.

## Phase 7 — Launch

**Constituent epic**: `EPIC-GOLIVE-SUPPORT`.
**Entry criteria**: Phases 1–5 substantially complete.
**Exit criteria**: incident drill + postmortem done, one feature-flagged iteration shipped, roadmap updated naming delivery/dispatch as the next extension.
**Status**: Not started (correctly deferred — this is post-launch by design).

## Related

- `portfolio-plan.md` — scope and MVP-line legend this plan executes against
- `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md` — the epic list and Suggested Build Order this plan's phases are built from
- `docs/ACTIVITY-LOG.md` — source of truth for what's actually been done
- `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`'s On-Deck queue — tracks the current specific next work item, at a finer grain than this phase-level plan
