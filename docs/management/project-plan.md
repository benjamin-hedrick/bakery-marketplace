# Project Plan (Execution-Level)

Distinct from `portfolio-plan.md` (scope, MVP-line legend, artifact ownership) and `MASTER-BACKLOG-OUTLINE.md`'s Suggested Build Order (epic sequencing). This document is the phase/milestone view a lead would actually track progress against — it references those two rather than restating them.

**Sequencing is relative, not calendar-dated** — phases are ordered "this before that," not scheduled to specific dates. Actual pace depends on available hours/week, which hasn't been decided; adding fabricated dates here would be worse than no dates at all. See `WI-MGMT-001`'s Open Points.

## Current status

**As of 2026-10-28.** Phase 0 is done. Phase 1 (shared infrastructure) is built and tested locally, except the cloud adapters and the gateway. **Phase 2's first slice, the customer journey from login through browse, customize and order to the confirmation, is built and passes on the real local stack**; the phase as written is still open, because it also names the live queue display and preferences (the queue display was taken out of slice 1 on purpose, decision D-E). Phases 4 and 5 are partly underway (local environment, CI baseline, tracing). Phase 3 (the remaining domain epics) has not started beyond what ordering needed. Phase 6 runs in parallel. Nothing has been deployed anywhere, and nothing has run against real Azure Cosmos, a managed Redis or Application Insights.

For the detail behind this summary, in order of usefulness: `docs/management/slice-1/01-project-status.md` (what is built and how it was verified), `docs/governance/open-items-register.md` (what is unreconciled), `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md` (the status of each work item; it, not a work item's own `Status:` field, is authoritative) and git history. `docs/ACTIVITY-LOG.md` is paused for new entries (open item 50). If this summary ever drifts from those, trust them.

## Phase 0 — Planning & Architecture *(Done)*

**Objective**: establish vision, domain model, and every foundational architecture decision before any code is written.
**Entry criteria**: none — this is the starting phase.
**Exit criteria**: vision, bounded context map, glossary, and all foundational ADRs accepted.
**Status**: Done — vision, bounded context map, glossary, ADR-0001 through ADR-0018 (the later ADRs came with the build: Next.js and the GraphQL BFF, cache layers, Azure Pipelines, tracing, stock ownership, service-to-service auth; ADR-0018 is Proposed), NFRs, C4 diagrams (context + container), and the SLA/SLO doc are all complete.

## Phase 1 — Foundational / Cross-Cutting Build *(Largely done, locally)*

**Objective**: build the shared infrastructure every domain feature depends on.
**Constituent epics**: `EPIC-CACHING`, `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`.
**Entry criteria**: Phase 0 complete (satisfied).
**Exit criteria**: every interface named in these epics (`CacheProvider`, `EventPublisher`/`EventSubscriber`, `Repository<T>`, auth middleware) is defined and contract-tested; local dev environment can actually run.
**Status**: **The exit criteria are met locally.** Built and contract-tested in `tools/`: the cache (local, Redis, resilient, chaos), events (in-memory and Redis Streams, with an outbox in ordering), data (a fake and a Cosmos repository, with optimistic concurrency and a transactional batch), auth (JWT validation, ownership checks, a mock OIDC issuer with PKCE and client credentials), secret validation, logging, correlation and tracing. `docker compose` runs Redis, the Cosmos emulator and the mock issuer (`docs/operations/local-dev.md`). **Not done:** the API gateway (`EPIC-API-GATEWAY`, deliberately skipped locally, ADR-0008), the cloud event and cache adapters, and the DEV credentials for service-to-service auth (`AUTH-006` phase 2). Several adapter tests fall back to fakes when Docker is absent, so a green run without Redis does not prove the real adapters (the Linux check and the pipeline assert Redis was used).

## Phase 2 — Core Domain Slice *(In progress: the first slice is built)*

**Objective**: the walking-skeleton path — enough to demo idea-to-order end-to-end.
**Constituent epics**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY`.
**Entry criteria**: Phase 1's interfaces exist (services can be built against something real, not a stub).
**Exit criteria**: a customer can browse, customize, order, and see it reflected on the live queue display, end-to-end, locally.
**Status**: **Slice 1 is built and verified locally on the real stack; the exit criterion as written is not met.** Done: the catalog (listings, stock, reserve and release), ordering (checkout with idempotency, pickup windows, the order lifecycle and its events through an outbox, vendor and customer actions, automatic confirmation of simple orders), the GraphQL BFF, and the customer web app (login with PKCE, browse with stock states, options and quantity, checkout, confirmation and status), proven by a browser journey against the real services. **Open:** the live queue display and its read model (`QUE-001`, `QUE-002`; moved out of slice 1 on 2026-10-28), preferences and dietary personalization (`PREF-*`, `SRCH-001`, `CUST-005`, `CUST-006`), and a vendor-facing way to see and act on orders (open items 63 and 76). Payment is a stub. See `docs/management/slice-1/` for the plan, the status and the estimated next work.

## Phase 3 — Remaining Domain Epics *(Not started)*

**Constituent epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`.
**Entry criteria**: Phase 2's walking skeleton works.
**Exit criteria**: full MVP feature set (per `portfolio-plan.md`'s MVP line) is functionally complete.
**Status**: Not started as epics. The only related work is what ordering needed: a clearly named payment stub (`PAY-001` replaces it), vendor verification as seeded data (`VEN-001`/`VEN-002` replace it), and the order-action API a vendor UI would call.

## Phase 4 — Delivery Infrastructure *(In progress)*

**Constituent epics**: `EPIC-LOCAL-DEV`, `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`.
**Entry criteria**: can start in parallel with Phase 2/3 once Phase 1 is done — not strictly sequential.
**Exit criteria**: a real deploy pipeline exists; `docker-compose up` reflects the actual architecture, not the current stub.
**Status**: **Local dev: done** (compose with the event backbone, Cosmos emulator, mock issuer and optional trace tools; seed; secret tooling; a script that runs the pipeline's .NET job on Linux). **CI: a baseline exists and has run on Azure** (`azure-pipelines.yml`: format, lint, build, tests, the real-stack smoke); it is a soft gate, not a required GitHub check (open item 45), and the newest smoke job, which now carries ordering and the browser journey, is awaiting its first full Azure run (open item 44 records run IDs). **Not done:** a deploy pipeline, container images for the services (item 71), hosting decisions (item 25), most Terraform (the only module is Key Vault, and the environment folders do nothing more than instantiate it).

## Phase 5 — Quality / Hardening *(Started)*

**Constituent epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY`.
**Entry criteria**: can run partly in parallel with Phase 3, per the Suggested Build Order.
**Exit criteria**: each epic's items are addressed to at least MVP-lite level.
**Status**: Started. **Observability:** W3C trace context across the web server, BFF, ordering and catalog (a checkout is one trace through the BFF, ordering and the catalog; checked with a full smoke run, `docs/evidence/slice-1/`), local viewers and collector configs; no cloud pipeline yet (item 37). **Frontend quality:** formatter, linter and type gates, unit tests, a mock-backed browser suite and the real-stack journey. **Not started:** rate limiting, feature flags, data privacy and deletion, backup and recovery.

## Phase 6 — Remaining Artifact Epics *(In Progress, Parallel)*

**Constituent epics**: `EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`.
**Entry criteria**: none — explicitly parallel to everything else, not blocked by build progress.
**Exit criteria**: every artifact in `docs/project-log.md`'s by-hat tables is ✅, not 🟡/⬜.
**Status**: In progress — `NFR-001`, `ARCH-001` (C4), `OPS-001` (SLA/SLO) done; the open-items register, the first-slice contract and the slice 1 status, plan and backlog documents are maintained as the work goes; `roadmap.md` and `okrs.md` are still stubs (🟡).

## Phase 7 — Launch

**Constituent epic**: `EPIC-GOLIVE-SUPPORT`.
**Entry criteria**: Phases 1–5 substantially complete.
**Exit criteria**: incident drill + postmortem done, one feature-flagged iteration shipped, roadmap updated naming delivery/dispatch as the next extension.
**Status**: Not started (correctly deferred — this is post-launch by design).

## Related

- `portfolio-plan.md` — scope and MVP-line legend this plan executes against
- `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md` — the epic list and Suggested Build Order this plan's phases are built from
- `docs/management/slice-1/` — the first slice's status, plan and critical path, and prioritized backlog with estimates
- `docs/governance/open-items-register.md` — what is unreconciled, and which items are needed before a deployment
- `docs/ACTIVITY-LOG.md` — history up to 2026-10-28 (paused, open item 50)
- `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`'s On-Deck queue — tracks the current specific next work item, at a finer grain than this phase-level plan
