# Project Plan (Execution-Level)

Distinct from `docs/product/scope.md` (scope, MVP-line legend, artifact ownership, each with its state), `docs/product/roadmap.md` (now, next, later) and `docs/product/demo-milestones.md` (what a person can do locally) and `docs/product/backlog/epic-catalog.md` (the epics; the September build order is in `docs/history/backlog-outline-2026-10-29.md`). This document is the phase/milestone view a lead would actually track progress against — it references those two rather than restating them.

**Sequencing is relative, not calendar-dated** — phases are ordered "this before that," not scheduled to specific dates. Actual pace depends on available hours/week, which hasn't been decided; adding fabricated dates here would be worse than no dates at all. See `WI-MGMT-001`'s Open Points.

## Current status

**As of 2026-11-08** (the phase statuses were last written on 2026-10-28; this pass brings them to the code and the evidence). Phase 0 is done. Phase 1 (shared infrastructure) is built and tested locally, except the cloud adapters and the gateway. **Phase 2 is built locally:** the customer journey (web and Android), the vendor's live queue with its actions, and the allergen profile with matching all run on the real local stack. Phase 3 has started in part: notifications are built (no real provider); vendor onboarding, admin, advertising, reviews and a real payment have not. Phase 4 has the local environment, a ten-job pipeline (the first run of three of its jobs on Azure is still to come) and a deployment path that is written and checked locally but never applied. Phase 5 has observability, rate limits and a security pass; feature flags, data privacy and backup are not started. Phase 6 runs in parallel. Nothing has been deployed anywhere, and nothing has run against real Azure Cosmos, a managed Redis or Application Insights.

For the detail behind this summary, in order of usefulness: `docs/product/backlog/current-plan.md` (what is built, in flight and next), `docs/management/slice-1/01-project-status.md` (slice 1 only, as of 2026-10-30), `docs/governance/open-items-register.md` (what is unreconciled), `docs/product/backlog/STATUS.md` (the status of each work item, generated from the spec banners) and git history. `docs/history/ACTIVITY-LOG.md` is paused for new entries (open item 50). If this summary ever drifts from those, trust them.

## Phase 0 — Planning & Architecture *(Done)*

**Objective**: establish vision, domain model, and every foundational architecture decision before any code is written.
**Entry criteria**: none — this is the starting phase.
**Exit criteria**: vision, bounded context map, glossary, and all foundational ADRs accepted.
**Status**: Done — vision, bounded context map, glossary, ADR-0001 through ADR-0023 (all accepted; the later ADRs came with the build: Next.js and the GraphQL BFF, cache layers, Azure Pipelines, tracing, stock ownership, service-to-service auth, the deployment path, browser sessions, live queue updates, tags and native sign-in), NFRs, C4 diagrams (context, container and component) and the SLA/SLO doc are all complete.

## Phase 1 — Foundational / Cross-Cutting Build *(Largely done, locally)*

**Objective**: build the shared infrastructure every domain feature depends on.
**Constituent epics**: `EPIC-CACHING`, `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`.
**Entry criteria**: Phase 0 complete (satisfied).
**Exit criteria**: every interface named in these epics (`CacheProvider`, `EventPublisher`/`EventSubscriber`, `Repository<T>`, auth middleware) is defined and contract-tested; local dev environment can actually run.
**Status**: **The exit criteria are met locally.** Built and contract-tested in `tools/`: the cache (local, Redis, resilient, chaos), events (in-memory and Redis Streams, with an outbox in ordering), data (a fake and a Cosmos repository, with optimistic concurrency and a transactional batch), auth (JWT validation, ownership checks, a mock OIDC issuer with PKCE and client credentials), secret validation, logging, correlation and tracing. `docker compose` runs Redis, the Cosmos emulator and the mock issuer (`docs/operations/local-dev.md`). **Not done:** the API gateway (`EPIC-API-GATEWAY`, deliberately skipped locally, ADR-0008), the cloud event and cache adapters, and the DEV credentials for service-to-service auth (`AUTH-006` phase 2). Several adapter tests fall back to fakes when Docker is absent, so a green run without Redis does not prove the real adapters (the Linux check and the pipeline assert Redis was used).

## Phase 2 — Core Domain Slice *(Built locally; not deployed)*

**Objective**: the walking-skeleton path — enough to demo idea-to-order end-to-end.
**Constituent epics**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY`.
**Entry criteria**: Phase 1's interfaces exist (services can be built against something real, not a stub).
**Exit criteria**: a customer can browse, customize, order, and see it reflected on the live queue display, end-to-end, locally.
**Status**: **The exit criterion is met locally** (a customer browses, customizes, orders and the order appears on the vendor's live queue, on the real local stack, in the browser journeys and in the demo film of 2026-11-08). Slice 1 (2026-10-28) was the catalog, ordering (checkout with idempotency, pickup windows, the order lifecycle and its events through an outbox, automatic confirmation), the GraphQL BFF and the customer web app. Since then: the vendor's read model, live queue and actions (`QUE-001` to `QUE-004`, `ORD-011`), the allergen profile, tags and conflict warnings (`PREF-001`, `SRCH-001`, `CUST-005` to `008`, ADR-0022), order history, saved payment methods, a listing cache, and the Android customer app. **Still open:** the vendor's own listing and stock screens (no spec yet) and a real payment (the processor is a stub: no money moves). Plan, status and estimates of slice 1, as of 2026-10-30, are in `docs/management/slice-1/`.

## Phase 3 — Remaining Domain Epics *(Started: notifications only)*

**Constituent epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`.
**Entry criteria**: Phase 2's walking skeleton works.
**Exit criteria**: full MVP feature set (per `docs/product/scope.md`'s MVP line) is functionally complete.
**Status**: `EPIC-NOTIFICATIONS` is built locally (`NOT-001`, `NOT-002`: the order events consumed in batches, a sender adapter, no real provider). Search exists only as the personalized read in the catalog (`SRCH-001`). The rest has not started as epics; the related work is what ordering needed: a clearly named payment stub (`PAY-001` replaces it), vendor verification as seeded data (`VEN-001`/`VEN-002` replace it), and the order-action API the queue display calls.

## Phase 4 — Delivery Infrastructure *(In progress)*

**Constituent epics**: `EPIC-LOCAL-DEV`, `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`.
**Entry criteria**: can start in parallel with Phase 2/3 once Phase 1 is done — not strictly sequential.
**Exit criteria**: a real deploy pipeline exists; `docker compose up` reflects the actual architecture, not the current stub.
**Status**: **Local dev: done** (compose with the event backbone, Cosmos emulator, mock issuer, optional trace tools and an `apps` profile that runs the services, the BFF and the web containers; seed; secret tooling; a script that runs the pipeline's .NET job on Linux). **CI: a ten-job baseline exists** (`azure-pipelines.yml`: secrets, docs, Terraform, .NET, BFF, web, queue display, session, mobile and the real-stack smoke); the secrets, docs, .NET, BFF, web, skeleton and Terraform jobs have been seen green on Azure, and the first run of the `queue`, `session` and `mobile` jobs is still to come (`pre-publish-gaps.md`, item 4). It is a soft gate, not a required check (open item 45). **Deployment path: written and checked locally, never applied** (`WI-DEP-001`, ADR-0020): container images, two Terraform stacks (a foundation and a dev environment, with mocked-provider tests), a dev pipeline and a gate rehearsal. **Not done:** applying any of it to Azure (the bootstrap and the Entra and IAM approvals are the lead's), a production environment, and the hosting decision in full (item 25).

## Phase 5 — Quality / Hardening *(Started)*

**Constituent epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY`.
**Entry criteria**: can run partly in parallel with Phase 3, per the Suggested Build Order.
**Exit criteria**: each epic's items are addressed to at least MVP-lite level.
**Status**: In progress. **Observability:** W3C trace context across the web server, BFF, ordering and catalog (a checkout is one trace through the BFF, ordering and the catalog; checked with a full smoke run, `docs/evidence/slice-1/`), local viewers and collector configs; no cloud pipeline yet (item 37). **Frontend quality:** formatter, linter and type gates, unit tests, a mock-backed browser suite, cross-browser runs, accessibility scans and the real-stack journeys. **Rate limiting:** built at the web apps and the BFF (`WI-RATE-001`). **Security:** a threat model, generated-input tests, a 66-minute soak, an OWASP ZAP scan, a dependency audit and SBOMs, and a review statement (`WI-SEC-004`, `WI-SEC-005`). **Not started:** feature flags, data privacy and deletion, backup and recovery.

## Phase 6 — Remaining Artifact Epics *(In Progress, Parallel)*

**Constituent epics**: `EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`.
**Entry criteria**: none — explicitly parallel to everything else, not blocked by build progress.
**Exit criteria**: every artifact in the archived `docs/history/project-log-2026-10-29.md` by-hat tables is ✅ (that log is no longer maintained; this criterion needs restating against `docs/index.md`), not 🟡/⬜.
**Status**: In progress — `NFR-001`, `ARCH-001` (C4), `OPS-001` (SLA/SLO) done; the open-items register is maintained as the work goes; `roadmap.md` and `okrs.md` are written; the testing, performance and delivery hubs and the AI-collaboration record exist (`docs/index.md`). The slice 1 status, plan and backlog documents are a snapshot of 2026-10-30; `current-plan.md` is the maintained status.

## Phase 7 — Launch

**Constituent epic**: `EPIC-GOLIVE-SUPPORT`.
**Entry criteria**: Phases 1–5 substantially complete.
**Exit criteria**: incident drill + postmortem done, one feature-flagged iteration shipped, roadmap updated naming delivery/dispatch as the next extension.
**Status**: Not started (correctly deferred — this is post-launch by design).

## Related

- `docs/product/scope.md` — scope and MVP-line legend this plan executes against
- `docs/product/backlog/epic-catalog.md` — the epic list this plan's phases are built from (the Suggested Build Order is in `docs/history/backlog-outline-2026-10-29.md`)
- `docs/management/slice-1/` — the first slice's status, plan and critical path, and prioritized backlog with estimates
- `docs/governance/open-items-register.md` — what is unreconciled, and which items are needed before a deployment
- `docs/history/ACTIVITY-LOG.md` — history up to 2026-10-28 (closed 2026-10-30)
- `docs/product/backlog/current-plan.md` — tracks the current specific next work, at a finer grain than this phase-level plan
