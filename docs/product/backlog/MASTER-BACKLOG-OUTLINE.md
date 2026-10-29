# Master Backlog Outline

A high-level list only — titles and, where already known from existing ADRs/decisions, a short detail. Full work-item detail (per `project-process-framework/templates/work-item-template.md`) comes later, one epic at a time. Two items are already fully drafted as validation examples: `WI-CACHE-001` and `WI-NFR-001` — see `EPIC-CACHING.md`.

Related trackers, not duplicated here: `docs/product/backlog/PARKING-LOT.md` (transient, per-conversation open items), `docs/governance/open-items-register.md` (permanent tradeoffs/tech debt), `docs/ACTIVITY-LOG.md` (chronological record of what's been done), `docs/product/backlog/LOCAL-MILESTONES.md` (what a fully-local run actually *does* at each stage — a different axis than the batch numbering below, which tracks agent-assignment safety, not runnable functionality).

> **2026-10-26 reconciliation — portfolio-slice decisions (ADR-0012 to ADR-0016).** Frontend moves to Next.js SSR (supersedes ADR-0011), a GraphQL BFF + Relay is added, the cache gains Relay/HTTP layers on top of ADR-0002, CI/CD moves to Azure Pipelines, and tracing uses OpenTelemetry + W3C Trace Context. Existing items are kept; those affected are marked inline below as **SUPERSEDED**, **ADJUSTED** or **OBSOLETE (cancelled)**, and each detailed item file has a matching dated note. Full record: `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`. New work: `EPIC-PORTFOLIO-SLICE` (below).

## Agent-Ready Queue (safe to assign to AI coding agents right now)

**Batch 1 — reviewed 2026-09-12.** All six items pass spec review (interface signatures match verbatim, required contract-test cases present) and passed the agents' own test runs. See `docs/ACTIVITY-LOG.md`'s 2026-09-12 entry for the detailed review notes, including one minor non-blocking nuance on `AUTH-001`'s issuer-swap test coverage.

| Item | Type | What it produces | Status |
|---|---|---|---|
| `WI-CACHE-001` | Interface/Contract | `ICacheProvider` + contract test base | Done — reviewed |
| `WI-EVT-001` | Interface/Contract | `IEventPublisher`/`IEventSubscriber` + envelope | Done — reviewed |
| `WI-DATA-001` | Interface/Contract | `IRepository<T>` + contract test base | Done — reviewed |
| `WI-AUTH-001` | Interface/Contract | JWT middleware + `IResourceOwnershipChecker` | Done — reviewed |
| `WI-CACHE-003` | Service Implementation | `LocalCacheProvider` + `ResilientCacheProvider` | Done — reviewed |
| `WI-CACHE-004` | Test/Mock/Chaos | `ChaosCacheProvider` + fallback proof tests | Done — reviewed |

**Batch 2 — done, reviewed.** Fully independent of Batch 1, zero coordination risk — this held up in review.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-TOOL-001` | Interface/Contract | Domain event payload records | Done — reviewed |
| `WI-TOOL-002` | Interface/Contract | Correlation-ID middleware + logging convention | Done — reviewed |
| `WI-SEC-001` | Infra/Environment | Key Vault + managed identity Terraform | Done — reviewed |
| `WI-SEC-003` | Test/Mock/Chaos | Fail-fast secret-validation tests | Done — reviewed |

**Batch 3 — foundational build toward full local end-to-end, ready for agents (added 2026-09-12).** Prioritized by a working session focused on getting the whole project running locally before any cloud-caching-vendor or cloud-gateway decisions matter. No internal dependencies between these five — fully parallel.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-DATA-002` | Service Implementation | `CosmosRepository<T>` | Blocks `SEC-002` |
| `WI-CACHE-002` | Service Implementation | `RedisCacheProvider` | Unblocked — vendor question only affects `CACHE-005`, not this item (see open item #22) |
| `WI-EVT-003` | Service Implementation | `RedisStreamsPublisher`/`Subscriber` | Prioritized ahead of `EVT-002` (EventGridPublisher, cloud-only, not needed for local e2e) |
| `WI-AUTH-002` | Service Implementation | Per-service resource-ownership check pattern + reference example | — |
| `WI-AUTH-005` | Service Implementation | Local mock OIDC/JWT issuer | Revised 2026-09-13 (Size S→M) — now also a real browser PKCE authorization-code flow, per ADR-0011's requirement and ADR-0006's corresponding amendment note. Closed a real gap: ADR-0006 describes this issuer, nothing had built it. Fully independent of the Entra swap. |

**Batch 3b — local environment wiring, depends on Batch 3 landing.**

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-DEV-002` | Infra/Environment | Real `docker-compose.yml` | **Done 2026-10-26** (verified under Docker; `docs/operations/local-dev.md`). Was: soft-blocked by Batch 3. Renumbered 2026-09-13 from `DEV-001` to `DEV-002` — `DEV-001` is now the base .NET solution/project scaffold (see `WI-DEV-001.md`), which needed to sit ahead of this item numerically since real service projects are a harder prerequisite than the Compose file itself. |
| `WI-DEV-004` | Infra/Environment | Seed/fixture data script | **Done 2026-10-27** (merged, PR #1): `tools/BakeryMarketplace.Seed`; verified against the real Cosmos emulator and Redis Streams. Preference profiles deferred to `PREF-001`. Seed source for the first end-to-end run. Renumbered 2026-09-13 from `DEV-003` to `DEV-004` — see the `DEV-001`/`DEV-002` renumbering note above; this shift is purely cosmetic, no content changed. |

**Batch 4 — walking skeleton (Layer 3), ready for agents once Batch 3/3b land (added 2026-09-12).** This is the actual customer-browse-to-order path per `portfolio-plan.md`'s original Sprint 1/2 scope. `ORD-004` is the one true blocking node — everything Order-related waits on the fulfillment seam being frozen first. **Also blocked on `WI-DEV-001`** (base .NET solution scaffold, added 2026-09-13) — every item below needs a real service project to add code to, not just the shared `/tools` libraries Batch 1/2 already scaffolded.

| Item | Type | What it produces | Blocked by |
|---|---|---|---|
| `WI-ORD-004` | Interface/Contract | `FulfillmentStrategy` seam (ACL boundary, ADR-0001) | `DEV-001` |
| `WI-CAT-001` | Service Implementation | Listing CRUD + modifier/allergy model | `DATA-002`, `EVT-003`, `AUTH-002`, `DEV-001` |
| `WI-ORD-002` | Service Implementation | `Order` aggregate + lifecycle states | **Built 2026-10-28, merged to main** (branch `feature/slice-ordering`): in-memory aggregate, 114 local tests, not run on Azure. Lifecycle changed from the spec after a review with the human lead: `docs/architecture/order-lifecycle.md` |
| `WI-ORD-003` | Service Implementation | `PickupFulfillment` strategy | partly built 2026-10-28: the pickup schedule (window source, lead time, Eastern hours in UTC) came with `ORD-001`, and `GET /ordering/pickup-windows` is built on it; `PickupFulfillment` (events, pickup-confirmed command) remains |
| `WI-ORD-006` | Integration | Order persistence via `Repository<T>` | **Built 2026-10-28, merged to main** (136 local tests + 3 on the real Cosmos emulator; not yet wired into the service host) |
| `WI-ORD-005` | Integration | Publish Order events via event backbone | **Built 2026-10-28, merged to main** (outbox in the order document, inline publish plus relay sweep; 258 ordering tests, also on Linux; verified on the real stack incl. a Redis outage; Placed-to-Completed on Redis was run later, under `ORD-007`; open items 72-75) |
| `WI-CAT-003` | Integration | Cache-aside integration for listing reads | `CAT-001`, `CACHE-002` |
| `WI-ORD-001` | Service Implementation | Cart + checkout (payment stubbed — `EPIC-PAYMENTS` not yet built) | **Built 2026-10-28, merged to main** (221 ordering tests, also on Linux; verified end to end on the real stack; payment is a stub, `OrderPlaced` is not yet published) |
| `WI-ORD-007` | Service Implementation | Order action endpoints: vendor confirm/decline/start/ready/complete/cancel, customer cancel (added 2026-10-28, approved) | **Built 2026-10-28, merged to main** (320 ordering tests, also on Linux; verified on the real stack incl. Placed-to-Completed on Redis; `complete` is direct until `ORD-003`; open item 76) |
| `WI-ORD-008` | Service Implementation | Automatic confirmation of orders with no options and no requested pickup window (added 2026-10-28, approved as D-A option 1) | **Built 2026-10-28, merged to main** (337 ordering tests; five mutation checks; per-item flag deferred) |
| `WI-QUE-001` | Service Implementation | Order-status read-model (event-fed, CQRS) | `ORD-005`, `EVT-003`, `DATA-002` |

Two real design choices surfaced while detailing this batch, captured as Open Points on the relevant items rather than decided silently — see `WI-CAT-001.md` (where catalog-service stores derived vendor-verification status) and `WI-ORD-001.md` (the exact shape of the payment-step stub). Neither blocks starting the batch; both should be confirmed before/during implementation.

**Batch 5 — Preferences & Vendor Onboarding domain items, detailed 2026-09-13.** Surfaced while scoping the customer-facing frontend (`EPIC-WEB-CUSTOMER`): the walking skeleton in Batch 4 covers Catalog and Ordering, but Preferences & Dietary Safety and Vendor Onboarding & Verification — both named in `portfolio-plan.md`'s original scope — had no detailed items. See `BATCH-5-CURATION.md` for the full rationale and the same two preconditions Batch 4 already established (Batch 1 verified against spec; `WI-DEV-001` drafted — confirm it's actually merged before assigning agents).

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-PREF-001` | Service Implementation | Preference Profile CRUD | Blocks `PREF-002`, `SRCH-001` |
| `WI-PREF-002` | Integration | Publishes `PreferenceSnapshotPublished` (new event, named while detailing this item) to Search (in-process) + Ordering (event backbone) | Blocked by `PREF-001`; also updated `glossary.md` and `data-model-api-contracts.md` in the same pass |
| `WI-VEN-001` | Service Implementation | Vendor profile + application (`VendorType`) | Also added `POST/GET/PUT /admin/vendors...` endpoints, a small gap resolved while detailing this item — see the file's own Context/Why |
| `WI-VEN-002` | Service Implementation | Verification status workflow, publishes `VendorVerified`/`VendorSuspended` | Blocked by `VEN-001`; this is the real implementation `DEV-004`'s seed-script workaround stands in for locally |

**Batch 6 — dietary-safety personalization (M4), detailed 2026-09-14.** Scoped directly from `docs/product/backlog/LOCAL-MILESTONES.md`'s M4 milestone — the gap between "preference data exists" (Batch 5) and "a customer can actually use it in a browser." Closes vision principle 1's headline promise for real, not just as stored data.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-SRCH-001` | Service Implementation | Personalized listing search — flags conflicts by default, `hideConflicts` opt-in | Blocked by `PREF-002`, `CAT-001`; blocks `CUST-006` |
| `WI-CUST-005` | Service Implementation | Preferences/dietary-profile UI page | Blocked by `WI-WEB-001`, `PREF-001` — no dependency on `SRCH-001` |
| `WI-CUST-006` | Service Implementation | Personalized allergen highlighting + hide-conflicts toggle on the existing browse view | Blocked by `SRCH-001`, `CUST-002` (already built) |

Explicitly still deferred (M5 and beyond, per `LOCAL-MILESTONES.md`): admin console UI, vendor listing-management UI, everything else already named as out of scope.

**Explicitly held from agent assignment** — do not queue these until the noted decision finalizes:
- `AUTH-004` (Entra External ID tenant/policy config) — open item #21
- `CACHE-005` (Terraform Redis toggle / cloud cache vendor provisioning) — open item #22, cloud caching backend deliberately deferred per 2026-09-12 session
- `EVT-002` (EventGridPublisher) — not held for a decision reason, just deprioritized behind `EVT-003` since it's cloud-only and not on the local-e2e critical path
- `GW-*` (API Gateway items) — ADR-0008 already says skip the gateway locally; no local-e2e need for these yet

**Frontend work, resolved 2026-09-13 (was: "Known gap, not yet a batch").** *(2026-10-26: framework and data path changed by ADR-0012/0013; `WEB-001` superseded, the `CUST-*` items and `QUE-002` adjusted. See the `EPIC-WEB-CUSTOMER` section.)* `EPIC-WEB-CUSTOMER` now exists with four detailed, Ready items (`WEB-001`, `CUST-002`, `CUST-003`, `CUST-004`) — see that epic file. `QUE-002` (`web-queue-display`'s UI) is likewise now detailed, sharing `WEB-001`'s scaffold rather than duplicating it. `web-admin` remains correctly out of scope: its backend epics (`EPIC-ADMIN`, `EPIC-VENDOR-ONBOARDING`) don't exist yet, so there is nothing for a `web-admin` frontend to call. The frontend items above are blocked by `WI-AUTH-005` (revised) for its PKCE endpoints, and independent of `WI-DEV-001`'s backend service scaffold.

**Portfolio slice — added 2026-10-26.** See `EPIC-PORTFOLIO-SLICE.md` and `docs/management/portfolio-slice/`.

| Item | Type | What it produces | Status / blocked by |
|---|---|---|---|
| `WI-PORT-001` | Test/Mock/Chaos | Next.js Pages Router + Relay SSR proof | **Done 2026-10-26** — proceed; in-repo Relay pattern, `relay-nextjs` rejected on security grounds. Evidence: `docs/evidence/WI-PORT-001/findings.md` |
| `WI-PORT-006` | Document/Artifact | Reconcile existing artifacts with ADR-0012 to ADR-0016 | In Progress — pass 1 (decision level) done 2026-10-26; pass 2: the `data-model-api-contracts.md` row done 2026-10-28, other rows open |
| `WI-PORT-007` | Interface/Contract | First-slice contract + GraphQL↔REST mapping, seed contract, error/state behavior | **Done 2026-10-28** — D-1 to D-4 accepted 2026-10-26, D-5 to D-10 accepted 2026-10-28 (`docs/architecture/first-slice-contract.md`); §4/§5 moved into `data-model-api-contracts.md` (`PORT-006` pass 2). Broad delegation is no longer waiting on approvals |
| `WI-PORT-002` | Integration | Walking skeleton: SSR → BFF → C# listing read, test, pipeline, trace **Built 2026-10-28, merged to main** (branch `feature/WI-PORT-002-walking-skeleton`; local run 5/5 smoke + 16/16 BFF tests; Azure pipeline written but not run; no OpenTelemetry export yet). Was Ready — `CAT-001` and `PORT-001` done; open: seed for the first end-to-end run — `DEV-004` seed done 2026-10-27, so the seed no longer blocks it |
| `WI-PORT-003` | Infra/Environment | Quality + Azure Pipelines CI baseline (supersedes `CI-001`) | **Built 2026-10-28, merged to main** (branch `feature/WI-PORT-003-ci-baseline`); all commands run locally, **Azure DevOps run green 2026-10-28** (reported by the human lead; most recent recorded run `#20261029.4`, 2026-10-29); formatter/linter gates added; GitHub placeholder stays until ADR-0015 exit criterion 2 |
| `WI-PORT-004` | Interface/Contract | Cache contract for the listing path, three layers | `PORT-002` |
| `WI-PORT-005` | Integration | Trace propagation + safe logs; `TOOL-002`/envelope follow-ups (supersedes `OBS-002`) | **In progress 2026-10-28** (branch `feature/WI-PORT-005-trace-propagation`): middleware and envelope parts built and tested; trace viewer choice and OpenTelemetry export open |

## On Deck (decided priority — update this whenever priority changes)

**2026-10-26**: the portfolio-slice sequence applies ahead of the frontend items below — `PORT-006` and `PORT-001` in parallel → `PORT-007` → assign shared-file owners → `PORT-002` → `PORT-003`/`004`/`005`. Backend Batch 3b/4/5 ordering is unchanged.


1. **`WI-DEV-001`** (base .NET solution/project scaffold) — unblocks all of Batch 4 and resolves `WI-WEB-001`'s CORS open point; natural next pick-up since it depends on nothing unreviewed. Also reconcile against Batch 1's actual delivered project structure once reviewed (see its own Open Points).
2. **Batch 3** (`DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005` revised) — assign to agents now, fully parallel; `AUTH-005`'s PKCE revision is a real scope change worth confirming with whoever picks it up.
3. ~~**`WI-WEB-001`** (shared frontend scaffold/PKCE) — ready in parallel with `WI-DEV-001`; blocked by `AUTH-005` (revised).~~ **SUPERSEDED 2026-10-26** by `WI-PORT-001`/`WI-PORT-002` (ADR-0012).
4. **Batch 3b** — `DEV-002` **done 2026-10-26**; `DEV-004` **done 2026-10-27**.
5. **Batch 4** (walking skeleton) — once Batch 3/3b/`WI-DEV-001` land; start with `ORD-004` since everything Order-side waits on it.
6. **Batch 5** (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002`) — detailed and Ready 2026-09-13; sequence alongside or just after Batch 4, since it depends on the same `WI-DEV-001` precondition but has no dependency on Batch 4's items themselves.
7. **Batch 6** (`SRCH-001`, `CUST-005`, `CUST-006`) — detailed and Ready 2026-09-14 (M4 per `LOCAL-MILESTONES.md`); sequence after Batch 5 and `EPIC-WEB-CUSTOMER` land, since it depends on both `PREF-002` and the already-built `CUST-002`.
8. **`ARCH-005`** (Component-level C4 diagrams) — still the only item left in `EPIC-ARCH-DOCS`, still low priority, unchanged from before.

`GOV-001`, `OPS-003`, `ARCH-002`, `ARCH-003`, `ARCH-004`, `OPS-001` remain done. `EPIC-PM-ARTIFACTS` has only `MGMT-003`/`MGMT-006` left, not currently on deck. Full history of prior reprioritizations is in `docs/ACTIVITY-LOG.md`, not repeated here each time.

Legend: 🟢 detail known now (from an existing ADR/decision) · ⚪ title only, detail TBD when picked up · ✅ detailed and Ready/Done

---

## Portfolio Slice Epic

### EPIC-PORTFOLIO-SLICE — see `EPIC-PORTFOLIO-SLICE.md` (added 2026-10-26)
Scope: cross-cutting · Primary hat(s): Architect, Engineering/Build, Platform Engineering · Status: Started (7 of 7 items detailed; `PORT-006` in progress)
- ✅ PORT-001 to PORT-007 — see the Portfolio slice table in the Agent-Ready Queue above

---

## Domain / Product Epics

### EPIC-CATALOG — Catalog & Customization
Scope: Catalog · Primary hat(s): Architect, Engineering/Build · Status: Started (2 of 4 items detailed, Ready for agents)
- ✅ CAT-001 (Service Implementation) — **Done 2026-10-26** (anonymous reads, integer cents, vendor-verification publish gate; evidence `docs/evidence/WI-CAT-001/findings.md`), see `WI-CAT-001.md` — Listing CRUD + modifier/add-in model, allergy flags per item (per glossary: Listing, Modifier, Allergy Flag); has two Open Points on vendor-verification-status storage and the local-dev seed dependency
- ⚪ CAT-002 (Service Implementation) — Coffee/bakery customization flow (modifier selection UI + validation)
- ✅ CAT-003 (Integration) — **Detailed, Ready for agents**, see `WI-CAT-003.md` — Consumes `CacheProvider` (EPIC-CACHING) for listing reads. **ADJUSTED (minor) 2026-10-26**: retained as ADR-0014 layer 1; record per-cache contract fields
- ⚪ CAT-004 (Service Implementation) — Catalog moderation queue hooks (feeds EPIC-ADMIN)
- ✅ CAT-005 (Service Implementation) — **Built 2026-10-28, merged to main** (71 catalog tests, verified on the real Cosmos emulator; adds optimistic concurrency to `BakeryMarketplace.Data`), see `WI-CAT-005.md` — listing stock fields (`availableQuantity`, `maxPerOrder`, `lowStockThreshold`), vendor set/increment/decrement, stock status on reads (ADR-0017)
- ✅ CAT-006 (Service Implementation) — **Built 2026-10-28, merged to main** (101 catalog tests; verified end to end on the real stack with a client-credentials token), see `WI-CAT-006.md` — atomic stock reserve and release endpoints for ordering (ADR-0017); the caller is `ORD-001`
- 🟢 AUTH-006 (Service Implementation) — **Added 2026-10-28**, see `WI-AUTH-006.md` — OAuth2 client credentials for service callers: mock issuer, shared library, local secret tooling (phase 1, **built 2026-10-28**, 80 Auth tests); DEV app registrations and credential (phase 2, after the ADR-0018 verification)

### EPIC-SEARCH — Search & Discovery
Scope: Search & Discovery · Primary hat(s): Architect, Digital PM · Status: Started (1 of 3 items detailed, Ready for agents — Batch 6, see `LOCAL-MILESTONES.md` M4) · Hosted in: `catalog-service` (ADR-0009)
- ✅ SRCH-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-SRCH-001.md` — dietary-preference filtering, consumes `PREF-002`'s Preference Snapshot in-process; flags conflicts by default, `hideConflicts` opt-in
- 🟢 SRCH-002 (Integration) — Blend sponsored placement into results (Partnership relationship w/ Advertising, per bounded context map)
- ⚪ SRCH-003 (Service Implementation) — Ranking logic, organic vs. sponsored

### EPIC-PREFERENCES — Preferences & Dietary Safety
Scope: Preferences & Dietary Safety · Primary hat(s): Architect, Digital PM · Status: Started (2 of 2 items detailed, Ready for agents — Batch 5, see `BATCH-5-CURATION.md`) · Hosted in: `catalog-service` (ADR-0009)
- ✅ PREF-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-PREF-001.md` — Preference Profile CRUD
- ✅ PREF-002 (Integration) — **Detailed, Ready for agents**, see `WI-PREF-002.md` — Publish Preference Snapshot via Open Host Service (per bounded context map) to Search + Ordering; named a new event (`PreferenceSnapshotPublished`) while detailing, added to `glossary.md`/`data-model-api-contracts.md` in the same pass

### EPIC-ORDERING — Ordering & Fulfillment (pickup v1)
Scope: Ordering & Fulfillment · Primary hat(s): Architect, Engineering/Build · Status: Started (6 of 6 walking-skeleton items detailed, Ready for agents)
- ✅ ORD-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-001.md` — Cart + checkout, payment step explicitly stubbed pending `EPIC-PAYMENTS`
- ✅ ORD-002 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-002.md` — Order aggregate + lifecycle states (`Pending → Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` or `Cancelled`, per ADR-0001; **built 2026-10-28**, see the outcome note in `WI-ORD-002.md`)
- ✅ ORD-003 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-003.md` — Pickup Window scheduling (PickupFulfillment strategy, per ADR-0001)
- ✅ ORD-004 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-ORD-004.md` — `FulfillmentStrategy` interface (the ACL boundary itself, per ADR-0001) — this is the seam a future Delivery strategy would plug into, and the top of this epic's critical path
- ✅ ORD-005 (Integration) — **Built 2026-10-28, merged to main**, see `WI-ORD-005.md` — Publish domain events (`OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted` per ADR-0003/glossary) via the event backbone (EPIC-EVENTING)
- ✅ ORD-006 (Integration) — **Detailed, Ready for agents**, see `WI-ORD-006.md` — Consumes `Repository<T>` for Cosmos-backed persistence (EPIC-DATA-STORE)
- ✅ ORD-007 (Service Implementation) — **Built 2026-10-28, merged to main**, see `WI-ORD-007.md` — order action endpoints (vendor confirm, decline, start, ready, complete, cancel; customer cancel)
- ✅ ORD-008 (Service Implementation) — **Built 2026-10-28, merged to main**, see `WI-ORD-008.md` — automatic confirmation of orders with no options and no requested pickup window

### EPIC-QUEUE-DISPLAY — Live Order-Queue Display
Scope: Ordering & Fulfillment (read-side) · Primary hat(s): Architect, Engineering/Build · Status: Started (2 of 2 items detailed)
- ✅ QUE-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-QUE-001.md` — Read-model built from order events, not a direct query against the `orders` container (per ADR-0004's CQRS decision)
- ✅ QUE-002 (Service Implementation) — **Detailed, Ready**, see `WI-QUE-002.md` — polling-based live UI (5–10s interval), real-time push (WebSockets/SignalR) explicitly named as a v2 candidate; shares `WEB-001`'s scaffold/auth pattern rather than a second bespoke frontend. **ADJUSTED 2026-10-26**: Next.js (client-rendered) via BFF, builds on `PORT-002`'s scaffold

### EPIC-WEB-CUSTOMER — Customer-Facing Web App
Scope: Catalog & Customization, Preferences & Dietary Safety, Ordering & Fulfillment (customer-facing UI only — backend logic lives in catalog-service/ordering-service) · Primary hat(s): Engineering/Build, Architect · Status: Started (6 of 6 items detailed, none built yet) · Added 2026-09-13, closing the frontend-scope gap named in Gap #7 below
- ⛔ WEB-001 (Service Implementation) — **SUPERSEDED 2026-10-26** by `WI-PORT-001`/`WI-PORT-002` (ADR-0012); PKCE/in-memory-token requirements carry forward. Was: **Detailed, Ready**, see `WI-WEB-001.md` — shared React/Vite scaffold + PKCE auth pattern, shared with `EPIC-QUEUE-DISPLAY` (`QUE-002` builds on this same scaffold); blocked by `WI-AUTH-005` (revised)
- ✅ CUST-002 (Service Implementation) — **Detailed, Ready**, see `WI-CUST-002.md` — listing browse/detail view, allergy flags/modifiers surfaced prominently per vision principle 1. **ADJUSTED 2026-10-26**: SSR Next.js page via BFF/Relay; blocked by `PORT-002`/`PORT-007` instead of `WEB-001`
- ✅ CUST-003 (Service Implementation) — **Built 2026-10-28, merged to main** (checkout UI; real-stack journey is `S1-07`), see `WI-CUST-003.md` — cart/checkout UI against `ORD-001`'s stubbed payment step, with an unmissable demo/test-mode banner. **ADJUSTED 2026-10-26**: client-rendered, GraphQL mutation per `PORT-007`; blocked by `PORT-002`/`PORT-007`
- ✅ CUST-004 (Service Implementation) — **Built 2026-10-28, merged to main** (order status page), see `WI-CUST-004.md` — order confirmation + order history/status view. **ADJUSTED 2026-10-26**: client-rendered via BFF; blocked by `PORT-002`/`PORT-007`
- ✅ CUST-005 (Service Implementation) — **Detailed, Ready — added 2026-09-14 (Batch 6, M4)**, see `WI-CUST-005.md` — preferences/dietary-profile UI, shared with `EPIC-PREFERENCES`. **ADJUSTED 2026-10-26**: client-rendered via BFF; blocked by `PORT-002`
- ✅ CUST-006 (Service Implementation) — **Detailed, Ready — added 2026-09-14 (Batch 6, M4)**, see `WI-CUST-006.md` — personalized allergen highlighting + hide-conflicts toggle on `CUST-002`'s browse view, shared with `EPIC-SEARCH`. **ADJUSTED 2026-10-26**: via BFF; personalized responses `private, no-store` (ADR-0014)

See `EPIC-WEB-CUSTOMER.md` for the full epic record.

### EPIC-FULFILLMENT-EXT — Delivery/Dispatch (v2, deferred)
Scope: Ordering & Fulfillment (future) · Primary hat(s): Architect · Status: Deferred (by design, not a gap)
- 🟢 FUL-001 (Document/Artifact) — Only item planned for now: keep ADR-0001 current if delivery requirements firm up before this is actually scheduled. No build items exist yet on purpose.

### EPIC-VENDOR-ONBOARDING — Vendor Onboarding & Verification
Scope: Vendor Onboarding & Verification · Primary hat(s): Architect, Digital PM · Status: Started (2 of 3 items detailed, Ready for agents — Batch 5, see `BATCH-5-CURATION.md`) · Hosted in: `admin-service` (ADR-0009)
- ✅ VEN-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-VEN-001.md` — Vendor profile + application (`VendorType`: Shop | Independent per glossary); also added `POST/GET/PUT /admin/vendors...` endpoints to `data-model-api-contracts.md`, a small gap (no `ApplyAsVendor` endpoint existed anywhere) resolved while detailing
- ✅ VEN-002 (Service Implementation) — **Detailed, Ready for agents**, see `WI-VEN-002.md` — Verification status workflow (`Pending → Verified` / `Suspended`), publishes `VendorVerified`/`VendorSuspended`. **Note**: `CAT-001` and `DEV-004` currently work around this not existing yet by having the seed script publish `VendorVerified` directly for local e2e; this item is the real implementation, and both coexisting is treated as intentional (see this item's own Open Points), not a gap to close immediately.
- 🟢 VEN-003 (Integration) — Stripe Connect Express onboarding flow (per ADR-0005) — store only the resulting connected-account ID + status, not raw KYC data

### EPIC-ADVERTISING — Advertising / Promotions
Scope: Advertising/Promotions · Primary hat(s): Digital PM, Architect · Status: Not Started · Hosted in: `catalog-service` (ADR-0009)
- ⚪ ADV-001 (Service Implementation) — Sponsored slot assignment (MVP-lite per portfolio-plan.md — simple flag, no bidding engine)
- ⚪ ADV-002 (Document/Artifact) — Monetization model detail (commission % vs. ad revenue split) — overlaps with EPIC-PRODUCT-STRATEGY, listed in both deliberately (see gap note below)

### EPIC-PAYMENTS — Payments & Payouts
Scope: Payments & Payouts · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- 🟢 PAY-001 (Integration) — Stripe Connect destination charges + `application_fee_amount` commission split (ADR-0005) — this is what `ORD-001`'s payment-step stub is designed to be replaced by
- 🟢 PAY-002 (Service Implementation) — `payouts` container as reconciliation read-model, populated via Stripe webhooks (ADR-0004 + ADR-0005)
- 🟢 PAY-003 (Test/Mock/Chaos) — Webhook idempotency tests (dedupe on Stripe event ID, same pattern as ADR-0003's event dedupe)
- ⚪ PAY-004 (Service Implementation) — Basic refund initiation (chargebacks explicitly out of scope per ADR-0005 / Open Item #6)

### EPIC-REVIEWS — Reviews / Trust
Scope: Reviews/Trust · Primary hat(s): Digital PM · Status: Not Started · Hosted in: `ordering-service` (ADR-0009)
- ⚪ REV-001 (Service Implementation) — Basic rating tied to completed Order + Vendor (MVP-lite; fraud/trust scoring deferred per portfolio-plan.md)

### EPIC-NOTIFICATIONS — Notifications
Scope: Notifications · Primary hat(s): Engineering/Build · Status: Not Started
- 🟢 NOT-001 (Service Implementation) — Event-triggered dispatch only, no business logic of its own (Conformist, per bounded context map)
- ⚪ NOT-002 (Service Implementation) — Templates: order confirmation, allergy warning, low-stock alert

### EPIC-ADMIN — Admin / Moderation Console
Scope: Admin/Moderation · Primary hat(s): Engineering/Build, Operations · Status: Not Started
- ⚪ ADM-001 (Service Implementation) — Vendor verification queue UI
- ⚪ ADM-002 (Service Implementation) — Listing moderation queue UI
- 🟢 ADM-003 (Service Implementation) — Read-model consumer of other contexts' events (thin, per bounded context map — not a rich domain of its own)

---

## Cross-Cutting Technical Epics

### EPIC-CACHING — see `EPIC-CACHING.md` (updated 2026-09-12: `CACHE-002` unblocked and Ready for agents; `CACHE-005` remains held; 2026-10-26: all items retained unchanged as layer 1 of ADR-0014; `PORT-004` adds the Relay/HTTP layers)

### EPIC-EVENTING — Event-Driven Backbone
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (2 of 5 items detailed)
- ✅ EVT-001 (Interface/Contract) — **Done**, see `WI-EVT-001.md` — `IEventPublisher`/`IEventSubscriber` interfaces + envelope shape (ADR-0003), real C# per ADR-0010. **ADJUSTED 2026-10-26**: envelope gains `traceparent` (ADR-0016), tracked in `PORT-005`
- 🟢 EVT-002 (Service Implementation) — `EventGridPublisher`/`EventGridSubscriber` (cloud) — deprioritized behind `EVT-003`, not needed for local e2e
- ✅ EVT-003 (Service Implementation) — **Done (2026-09-15)**, see `WI-EVT-003.md` — `RedisStreamsPublisher`/`Subscriber` (local Redis Streams transport with consumer groups and dead-lettering)
- ⚪ EVT-004 (Test/Mock/Chaos) — Contract-test suite + `ChaosEventTransport` (duplicate/out-of-order/delayed/dropped delivery, per ADR-0003) — blocked by `EVT-003`
- ⚪ EVT-005 (Infra/Environment) — Terraform Event Grid custom topic + subscription filters

### EPIC-DATA-STORE — Cosmos DB Repositories
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (2 of 4 items detailed)
- ✅ DATA-001 (Interface/Contract) — **Done**, see `WI-DATA-001.md` — `IRepository<T>` interface (ADR-0004), real C# per ADR-0010
- ✅ DATA-002 (Service Implementation) — **Done (2026-09-15)**, see `WI-DATA-002.md` — `CosmosRepository<T>` implementation using Cosmos SDK directly with LINQ query provider
- 🟢 DATA-003 (Test/Mock/Chaos) — `FakeRepository<T>` + contract tests against the Cosmos emulator — `FakeRepository<T>` already exists from `DATA-001`; the emulator-based contract-test run is the remaining piece. **Unblocked 2026-10-26** by `DEV-002`. First job: fix the test entity (`Id` serializes as `Id`, Cosmos needs `id`) and the silent skip — the current Cosmos tests pass without touching Cosmos and 3 of 4 fail against the real emulator (`docs/operations/local-dev.md`)
- ⚪ DATA-004 (Infra/Environment) — Terraform Cosmos account + per-container partition key config

### EPIC-AUTH — Auth/Authz
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (3 of 5 items detailed, Ready for agents)
- ✅ AUTH-001 (Interface/Contract) — **Done**, see `WI-AUTH-001.md` — JWT middleware + ownership checker, real C# per ADR-0010; explicitly unaffected by the pending Entra External ID swap (open item #21)
- ✅ AUTH-002 (Service Implementation) — **Done (2026-09-15)**, see `WI-AUTH-002.md` — ResourceOwnershipRequirement & ResourceOwnershipHandler<TResource> with role short-circuiting + reference example
- 🟢 AUTH-003 (Test/Mock/Chaos) — Deterministic tests: expired/tampered/malformed token handling (ADR-0006 — explicitly not a live chaos decorator, see ADR's own reasoning)
- 🛑 AUTH-004 (Infra/Environment) — **HOLD — do not assign to agents.** Tenant + policy configuration — targets Microsoft Entra External ID, not Azure AD B2C, per open item #21. Held until that migration decision is finalized. Confirmed 2026-09-12 that this hold is unaffected by anything in Batch 3/4 — Entra confirmation covers the *cloud* tenant only.
- ✅ AUTH-005 (Service Implementation) — **Detailed, Ready for agents — revised 2026-09-13**, see `WI-AUTH-005.md` — Local mock OIDC/JWT issuer for dev. Closed a real gap identified 2026-09-12: ADR-0006/`tech-stack.md` describe this issuer, nothing had ever built it. Fully independent of the Entra swap. **Revised Size S→M on 2026-09-13**: ADR-0011 (frontend framework) requires a real browser PKCE authorization-code redirect flow, not just direct token minting — folded into this item's spec directly (see ADR-0006's corresponding amendment note) since nothing had started building it yet. Now shared with `EPIC-WEB-CUSTOMER` (`WEB-001` depends on it for the browser login flow).

### EPIC-SECRETS — Secrets Management
Scope: cross-cutting (all contexts) · Primary hat(s): Platform Engineering · Status: Started (2 of 3 items detailed, Ready for agents)
- ✅ SEC-001 (Infra/Environment) — **Done**, see `WI-SEC-001.md` — per-environment Key Vault + managed identity RBAC (ADR-0007)
- 🟢 SEC-002 (Service Implementation) — Cosmos DB access via managed identity (eliminating the connection-string secret, per ADR-0007) — blocked by `DATA-002`, now Ready for agents in Batch 3
- ✅ SEC-003 (Test/Mock/Chaos) — **Done**, see `WI-SEC-003.md` — fail-fast startup validation, deterministic tests only per ADR-0007

### EPIC-API-GATEWAY — Azure API Management
Scope: cross-cutting (all frontend-to-service traffic) · Primary hat(s): Architect, Platform Engineering · Status: Not Started
- 🟢 GW-001 (Infra/Environment) — Terraform: APIM Consumption tier resource + route configuration for all four backend services (ADR-0008)
- 🟢 GW-002 (Infra/Environment) — Policy config: `Validate JWT` fast-fail policy + coarse role-based routing, versioned as code in the repo (ADR-0008) — does not replace `AUTH-002`'s per-service checks, both exist
- 🟢 GW-003 (Test/Mock/Chaos) — Static policy-config lint in CI (parses policy XML, asserts expected routes/policies present, no live instance needed). **ADJUSTED 2026-10-26**: runs in Azure Pipelines (ADR-0015)
- 🟢 GW-004 (Infra/Environment) — Shared dev-tier APIM instance for real policy integration testing (same shape as Stripe test-mode testing per ADR-0005)
- ⛔ GW-005 (Infra/Environment) — **OBSOLETE (cancelled) 2026-10-26**: browser apps now talk only to the GraphQL BFF, so frontend URL parity with APIM no longer matters (ADR-0013 / ADR-0008 amendment). Was: Local reverse-proxy stand-in (Compose service) mirroring APIM's path-based routing for URL/structural parity
- 🟢 GW-006 (Infra/Environment) — Coarse per-subscription rate-limit policy — overlaps with `EPIC-RATE-LIMITING`'s `RATE-004`, deliberately cross-listed (see gap note below); Consumption tier does not support `rate-limit-by-key`, so this does not cover per-user/per-content abuse prevention

**Note (2026-10-26)**: per ADR-0013, APIM now sits between the BFF and the services in the cloud; browser apps no longer call APIM. `GW-001`/`002`/`004`/`006` are otherwise unchanged.

**Note (2026-09-12)**: per ADR-0008, local dev skips the gateway entirely and calls services directly — none of `EPIC-API-GATEWAY`'s items are needed for local end-to-end and none are in Batch 3/4.

### EPIC-SHARED-TOOLING — Reusable Packages
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: Started (2 of 4 items detailed, Ready for agents)
- ✅ TOOL-001 (Interface/Contract) — **Done**, see `WI-TOOL-001.md` — domain event payload records, fully independent of batch 1
- ✅ TOOL-002 (Interface/Contract) — **Done**, see `WI-TOOL-002.md` — correlation-ID middleware + structured logging convention. **ADJUSTED 2026-10-26**: ID source becomes the W3C trace ID (ADR-0016); follow-up code change tracked in `PORT-005`
- 🟢 TOOL-003 (Interface/Contract) — `/tools/auth-middleware` — same item as `AUTH-001`, already detailed and Done there (see `WI-AUTH-001.md`); this line stays as the deliberate cross-listing pointer, not a duplicate
- ⚪ TOOL-004 (Service Implementation) — Shared fault-injection harness (used by EPIC-CACHING, EPIC-EVENTING, EPIC-DATA-STORE chaos items)

---

## Platform Engineering / Delivery Infrastructure Epics

### EPIC-LOCAL-DEV — Local Development Environment
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: Started (2 of 4 items detailed, Ready for agents) · Renumbered 2026-09-13, see note below
- ✅ DEV-001 (Infra/Environment) — **Done (2026-09-15)**, see `WI-DEV-001.md` — Base .NET solution/project scaffold (one Web API project per service, per ADR-0010) — resolves `worklog-2026-09-07.md`'s gap #1. Also carries `WI-WEB-001`'s CORS open point as a concrete acceptance criterion. Unblocks all of Batch 4.
- ✅ DEV-002 (Infra/Environment) — **Done 2026-10-26** (verified under Docker; `docs/operations/local-dev.md`), see `WI-DEV-002.md` — Real `docker-compose.yml`: Redis Streams (default), Cosmos emulator (default), mock OIDC issuer (default, `AUTH-005`), cache Redis (profile-gated), per ADR-0002/0003/0004/0006. **ADJUSTED 2026-10-26**: also the Next.js app(s), the GraphQL BFF and a local trace viewer once built; no APIM stand-in (`GW-005` obsolete). **Renumbered 2026-09-13 from `DEV-001` to `DEV-002`** — content unchanged, see the note below.
- 🟢 DEV-003 (Infra/Environment) — Stripe CLI webhook forwarding setup (ADR-0005) — deprioritized behind the walking skeleton, since `ORD-001`'s payment step is stubbed for now; needed once `PAY-001` is picked up. **Renumbered 2026-09-13 from `DEV-002` to `DEV-003`** — title-only, no content to change.
- ✅ DEV-004 (Infra/Environment) — **Detailed, Ready for agents**, see `WI-DEV-004.md` — Seed/fixture data script, including publishing `VendorVerified` for seeded vendors as the interim local substitute for `EPIC-VENDOR-ONBOARDING` not existing yet. **Renumbered 2026-09-13 from `DEV-003` to `DEV-004`** — content unchanged apart from updated cross-references.

**Renumbering note (2026-09-13)**: `worklog-2026-09-07.md`'s recommended fix for gap #1 (no work item for the .NET solution scaffold) proposed calling that new item `WI-DEV-001` — a reasonable, independently-chosen ID that happened to collide with the `docker-compose.yml` item already assigned `DEV-001` in this same epic during the 2026-09-12 session. Rather than force the new, more foundational item into a later slot, the existing three `EPIC-LOCAL-DEV` items were shifted up by one (`DEV-001→002`, `DEV-002→003`, `DEV-003→004`) so `DEV-001` numerically reflects what actually has to exist first. No file's *content* changed as part of this beyond fixing the small number of internal cross-references that named the old IDs (see each renamed file's own note).

### EPIC-CI-CD — CI/CD Pipeline
Scope: repo-level · Primary hat(s): Platform Engineering · Status: Not Started · **2026-10-26: CI/CD system of record is Azure Pipelines (ADR-0015); GitHub stays source control**
- ⛔ CI-001 (Infra/Environment) — **SUPERSEDED 2026-10-26** by `WI-PORT-003`. Was: Real build/test stages, replacing the current placeholder
- ⚪ CI-002 (Infra/Environment) — OIDC federated deploy step per environment. **ADJUSTED 2026-10-26**: Azure Pipelines service connection using workload identity federation (ADR-0015, ADR-0007 amendment)
- ⚪ CI-003 (Infra/Environment) — Ephemeral/preview environment, at least one working example (Open Item #15). **ADJUSTED 2026-10-26**: built on Azure Pipelines; must include the Next.js app and BFF
- ✅ CI-004 (Infra/Environment) — **Done 2026-10-28**: `ci.yml` removed; required-check repointing waived as a soft manual gate (enterprise plan needed for rulesets), see ADR-0015 amendment. Was: **Added 2026-10-26**: GitHub Actions → Azure Pipelines migration cut-over — repoint required checks, update docs, remove `.github/workflows/ci.yml` in one commit, once ADR-0015's exit criteria are met

### EPIC-CLOUD-INFRA — Terraform / Cloud Environments
Scope: cross-cutting · Primary hat(s): Platform Engineering, Architect · Status: Not Started
- ⚪ INFRA-001 (Infra/Environment) — Per-environment `.tfvars` (dev/staging/prod), matching existing `/infra/environments` scaffold
- ⚪ INFRA-002 (Infra/Environment) — Container Apps compute + Static Web Apps frontend hosting (per tech-stack.md). **ADJUSTED 2026-10-26**: Static Web Apps no longer fits Next.js SSR; frontend + BFF need Node-capable hosting (Container Apps the default candidate, decided here) — ADR-0012/0013

### EPIC-REPO-OPS — Repo/Tooling Meta-Infrastructure
Scope: repo-level · Primary hat(s): Manager/Lead, Platform Engineering · Status: Not Started
- ⚪ REPO-001 (Infra/Environment) — Publish docs site via GitHub Pages (`mkdocs gh-deploy` or Pages Action) — `mkdocs.yml` already ready (Open Item #13). **ADJUSTED 2026-10-26**: GitHub Pages hosting is still fine; the publish step runs from Azure Pipelines or a manual `mkdocs gh-deploy`, not a GitHub Actions workflow (ADR-0015)
- ⚪ REPO-002 (Infra/Environment) — GitHub Projects board setup (`Backlog → Ready → In Progress → Review → Done`, per portfolio-plan.md) (Open Item #12)

---

## Architecture & Operations Artifact Epics

### EPIC-ARCH-DOCS — Remaining Architecture Documents
Scope: cross-cutting-artifact · Primary hat(s): Architect · Status: Started (5 of 6 items done — only ARCH-005 left, low priority)
- ✅ NFR-001 (Document/Artifact) — **Done**, see `docs/architecture/nfrs.md` + `WI-NFR-001.md`
- ✅ ARCH-001 (Document/Artifact) — **Done**, see `docs/architecture/c4/context.md` + `container.md` — surfaced and resolved a bounded-context-to-service mapping gap, formalized as ADR-0009
- ✅ ARCH-002 (Document/Artifact) — **Done**, see `docs/architecture/capability-map.md` + `WI-ARCH-002.md` — business-facing re-grouping of `bounded-contexts.md`, consistent with ADR-0009's service mapping
- ✅ ARCH-003 (Document/Artifact) — **Done**, see `docs/architecture/data-model-api-contracts.md` + `WI-ARCH-003.md` — per-service Cosmos document shapes, events, and API endpoints; resolved the event-dedupe store location (CacheProvider) and made the ADR-0004 read-model split concrete (`order-status-readmodel`)
- ✅ ARCH-004 (Document/Artifact) — **Done**, see `docs/architecture/ddd/event-storming.md` + `WI-ARCH-004.md` — surfaced 4 previously-unnamed events (`ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected`), added to glossary.md and `data-model-api-contracts.md`
- ⚪ ARCH-005 (Document/Artifact) — Component-level C4 diagrams for `ordering-service` and `catalog-service`, explicitly deferred from `WI-ARCH-001`'s scope — logged now so it's tracked rather than just remembered

### EPIC-OPS-ARTIFACTS — Operations/SRE Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Operations · Status: Started (2 of 4 items done)
- ✅ OPS-001 (Document/Artifact) — **Done**, see `docs/operations/sla.md` + `WI-OPS-001.md` — 99.0% monthly target, error budget policy, latency targets, known failure modes, all traced to `nfrs.md`/ADRs
- ⚪ OPS-002 (Document/Artifact) — Runbook, tied to a real failure mode from the ADRs (candidates: Redis fallback per ADR-0002, Cosmos throttling per ADR-0004)
- ✅ OPS-003 (Document/Artifact) — **Done**, see `docs/operations/monitoring-alerting.md` + `WI-OPS-003.md` — policy layer (thresholds), distinct from `EPIC-OBSERVABILITY`'s implementation layer
- ⚪ OPS-004 (Document/Artifact) — On-call pattern doc (hypothetical)

### EPIC-GOVERNANCE — Governance Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Governance · Status: Started (open items register active, GOV-001 done)
- ✅ (ongoing) `docs/governance/open-items-register.md` — active, not a discrete work item, a living document
- ✅ GOV-001 (Document/Artifact) — **Done**, see `docs/governance/architecture-review.md` + `WI-GOV-001.md` — explicitly distinguishes this project's ADR governance from `project-process-framework/discovery/README.md`'s separate scope
- ⚪ GOV-002 (Document/Artifact) — Explicit scope decision on legal artifacts (Terms of Service, Privacy Policy): in or out for v1, and why. Never appeared anywhere before this review pass, not even as a "scoped out" note — worth an explicit decision either way rather than continued silence, especially given the playbook was deliberately generalized to work for real projects too.

---

## Manager/Lead & Product Strategy Epics

### EPIC-PM-ARTIFACTS — Manager/Lead Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Manager/Lead · Status: Started (3 done, 3 in review, 2 not started)
- 🟡 MGMT-001 (Document/Artifact) — drafted, see `docs/management/project-plan.md` + `WI-MGMT-001.md` — 1 open decision (relative vs. calendar-date phasing)
- 🟡 MGMT-002 (Document/Artifact) — drafted, see `docs/management/risk-register.md` + `WI-MGMT-002.md` — 1 open decision (confirm likelihood/impact ratings)
- ⚪ MGMT-003 (Document/Artifact) — RACI (hypothetical team)
- ✅ MGMT-004 (Document/Artifact) — **Done**, see `docs/process/engineering-standards.md` + `WI-MGMT-004.md`
- 🟡 MGMT-005 (Document/Artifact) — drafted, see `docs/management/budget-cost-estimate.md` + `WI-MGMT-005.md` — 1 open decision (labor/time cost, deliberately not invented)
- ⚪ MGMT-006 (Document/Artifact) — Team structure + hiring plan (hypothetical)
- ✅ MGMT-007 (Document/Artifact) — **Done**, see `docs/management/stakeholder-communications-plan.md` + `WI-MGMT-007.md` — deliberately not blocked on `MGMT-006`
- ✅ MGMT-008 (Document/Artifact) — **Done**, see `docs/process/branching-strategy.md` + `WI-MGMT-008.md` — trunk-based + feature flags, repo-wide versioning; surfaced a new gap (API/URL versioning via APIM, not yet decided — see `PARKING-LOT.md`)

### EPIC-PRODUCT-STRATEGY — Digital PM Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Digital PM · Status: Started (1 of 4 done)
- ✅ PROD-001 (Document/Artifact) — **Done**, see `docs/product/personas.md` + `WI-PROD-001.md`
- ⚪ PROD-002 (Document/Artifact) — Competitive scan
- ⚪ PROD-003 (Document/Artifact) — Monetization model — overlaps with `ADV-002` above; deliberately listed in both places rather than picking one home (see gap note below)
- ⚪ PROD-004 (Document/Artifact) — OKRs / success metrics (north-star safety metric already named in vision; needs the rest)

---

## Launch & Support Epic

### EPIC-GOLIVE-SUPPORT — Go-Live & Refinement
Scope: cross-cutting-artifact (post-MVP) · Primary hat(s): Operations, Manager/Lead · Status: Deferred (post-launch, by design)
- ⚪ LAUNCH-001 (Test/Mock/Chaos) — Incident/game-day drill (real incident if one occurs first; a deliberate drill otherwise, per `project-process-framework/core/phase-sequence.md` Phase 8 guidance)
- ⚪ LAUNCH-002 (Document/Artifact) — Postmortem from the above drill
- 🟢 LAUNCH-003 (Document/Artifact) — Roadmap update naming delivery/dispatch (EPIC-FULFILLMENT-EXT) as the next planned extension
- 🟢 LAUNCH-004 (Service Implementation) — One feature-flagged iteration (uses `FLAG-001`), per `portfolio-plan.md`'s original refinement-phase step — this had dropped out of the outline until this review pass

### EPIC-OBSERVABILITY — Instrumentation
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering, Operations · Status: Not Started
- ⚪ OBS-001 (Service Implementation) — Application Insights wiring per service. **ADJUSTED 2026-10-26**: OpenTelemetry SDK + Azure Monitor exporter, covering the Next.js server and BFF as well as the C# services (ADR-0016)
- ⛔ OBS-002 (Integration) — **SUPERSEDED 2026-10-26** by `WI-PORT-005` (W3C Trace Context replaces custom correlation-ID propagation, ADR-0016). Was: Correlation-ID propagation across services, using `/tools/logging-helper` (`TOOL-002`)
- ⚪ OBS-003 (Document/Artifact) — Actual dashboard construction implementing `OPS-003`'s thresholds (corrected: `OPS-003` is the policy layer this item implements against, not the other way around — see `docs/operations/monitoring-alerting.md`)

### EPIC-RATE-LIMITING — Rate Limiting / Abuse Prevention
Scope: cross-cutting-artifact · Primary hat(s): Architect, Platform Engineering · Status: Not Started
- ⚪ RATE-001 (Service Implementation) — API-level rate limiting
- ⚪ RATE-002 (Service Implementation) — Review/rating abuse detection (fake reviews) — overlaps with `EPIC-REVIEWS`, deliberately cross-listed rather than picked into one home (same pattern as the monetization-model overlap noted below)
- ⚪ RATE-003 (Service Implementation) — Ad-fraud detection basics — overlaps with `EPIC-ADVERTISING`, same deliberate cross-listing
- 🟢 RATE-004 (Infra/Environment) — Coarse per-subscription throttling at the API Gateway — overlaps with `EPIC-API-GATEWAY`'s `GW-006`; per ADR-0008, this does NOT cover `RATE-001`/`002`/`003`'s per-user/per-content concerns, since Consumption tier lacks `rate-limit-by-key`

### EPIC-FEATURE-FLAGS — Feature Flag Implementation
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering · Status: Not Started
- 🟢 FLAG-001 (Service Implementation) — Feature-flag pattern, per `tech-stack.md`'s configuration-management principle
- ⚪ FLAG-002 (Integration) — First real usage: flagging the refinement-phase iteration (`LAUNCH-004`, added below)

### EPIC-DATA-PRIVACY — Sensitive Data Handling
Scope: cross-cutting-artifact · Primary hat(s): Architect, Governance · Status: Not Started
- ⚪ PRIV-001 (Document/Artifact) — Explicit sensitive-data-handling doc for dietary/allergy data (quasi-health data) — this has been named repeatedly across the vision, NFRs, and glossary but only ever as a mention inside another document; it's been raised often enough to warrant its own artifact rather than staying a paragraph inside `NFR-001`
- ⚪ PRIV-002 (Document/Artifact) — Data retention/deletion policy for customer preference profiles

### EPIC-BACKUP-DR — Backup / Disaster Recovery Baseline
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering, Operations · Status: Not Started
- ⚪ BDR-001 (Infra/Environment) — Cosmos DB point-in-time restore configuration
- ⚪ BDR-002 (Infra/Environment) — Key Vault soft-delete + purge protection (ties to ADR-0007)
- ⚪ BDR-003 (Document/Artifact) — Lightweight DR runbook — overlaps with `OPS-002`, deliberately cross-listed

### EPIC-FRONTEND-QUALITY — Accessibility & Internationalization
Scope: cross-cutting-artifact · Primary hat(s): Engineering/Build · Status: Not Started
- ⚪ FE-001 (Service Implementation) — Baseline accessibility pass (`web-customer`, `web-admin`, `web-queue-display`) — named early as part of "a reasonably interesting UI," never resurfaced until now. **`web-customer` and `web-queue-display` now have detailed items to apply this against (`EPIC-WEB-CUSTOMER`, `QUE-002`); `web-admin` still doesn't exist, since its backend epics aren't built yet.**
- ⚪ FE-002 (Service Implementation) — i18n scaffolding (even if only English is shipped for v1, per ADR-0005's single-region/currency assumption) — structure now, populate later

### EPIC-BACKLOG-PLANNING — Backlog Meta-Work
Scope: cross-cutting-artifact · Primary hat(s): Product Owner · Status: Not Started
- ⚪ PLAN-001 (Document/Artifact) — Prioritization output (MoSCoW/RICE) applied to this master outline — listed as "Planned" in `project-log.md` but had fallen out of the outline itself until now
- ⚪ PLAN-002 (Document/Artifact) — Sprint plan (first 2–3 sprints), depends on `PLAN-001`

---

## Suggested Build Order (rough — not the formal prioritization exercise)

Not a substitute for `PLAN-001`, just a rough sanity check so the outline isn't just an unordered pile:

1. **Foundational/cross-cutting first**: `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`, `EPIC-CACHING` — everything else depends on these existing
2. **Core domain slice**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY`, `EPIC-WEB-CUSTOMER` — the walking-skeleton path from `portfolio-plan.md`'s original Sprint 1/2, now including a real customer-facing frontend — **as of 2026-09-13, this is the active focus, targeting a full local end-to-end run with a browser-visible demo, not just a backend API surface**
3. **Remaining domain epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`
4. **Delivery infrastructure**: `EPIC-LOCAL-DEV` (in progress, see Batch 3b above), `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`
5. **Quality/hardening epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY` — can run partly in parallel with (3), not strictly after
6. **Artifact epics** (`EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`) — largely parallel to everything else; not blocked by build progress
7. **Launch**: `EPIC-GOLIVE-SUPPORT`, last

---

## Gaps identified while building this outline (resolved ones kept for history, not deleted)

1. **Deliberate cross-listing (resolved)** — `work-item-template.md` now has a `Shared with epic(s):` field, added specifically because five instances of this (monetization model, `/tools/auth-middleware`, review/ad-fraud abuse detection, the DR runbook, and the gateway rate-limit policy) showed up before the field existed. The five existing cross-listed items above still use the old manual-note style rather than the new field — a small backfill, not yet done, moved to `PARKING-LOT.md` rather than left here.
2. **Non-technical epics' Scope field (resolved)** — standardized to exactly two values (`cross-cutting-artifact`, `repo-level`), both the template and all epics in this file backfilled to match.
3. **API Gateway / BFF layer — resolved; revisited 2026-10-26.** *(ADR-0013 adds a GraphQL BFF as the browser's entry point, with APIM retained in front of service APIs — see ADR-0008's amendment note.)* ADR-0008 decided Azure API Management (Consumption tier) with zero-trust dual validation — APIM performs an edge fast-fail check, every service still independently validates per ADR-0006. `EPIC-API-GATEWAY` added, `AUTH-002` and `RATE-004`/`GW-006` annotated to reflect the actual scope boundary (the gateway does not replace per-service auth or per-user rate limiting — Consumption tier's lack of `rate-limit-by-key` was the key finding that shaped this).
4. **Context completeness (resolved, process-level)** — a "zero trust" assumption existed only in the human's head until an unrelated decision (API Gateway) surfaced it. Fixed at the process level, not just here: `project-process-framework/core/context-completeness.md` now names "surprise as a trigger," two front-loaded checklists (`templates/technology-decision-checklist.md`, `templates/business-decision-checklist.md`) exist for the preventive side, and the work-item template gained categorized (not flat) references, a "You do not need to know about" field, and a transient "Open Points (working)" section. Applied here: `vision.md` gained an explicit zero-trust principle, ADR-0006 gained an explicit token-storage/CSRF note, and `WI-NFR-001` now explicitly requires both plus injection-protection content.
5. **Bounded-context-to-service mapping — resolved.** Formalized as ADR-0009: 13 bounded contexts grouped onto the 4 existing services (`catalog-service`, `ordering-service`, `admin-service`, `notification-service`), with a binding "modular monolith" rule that co-located contexts still communicate through the same interfaces/events they'd use if physically separate. The root cause (scaffolding making a real decision by default, before any decision-record discipline existed) is also fixed at the process level: `core/phase-sequence.md` Phase 4 now requires this mapping be explicit before scaffolding, and both `technology-decision-checklist.md` and `architecture-patterns.md` were updated to name the pattern.
6. **Local mock OIDC issuer — resolved 2026-09-12, scope revised 2026-09-13.** ADR-0006 and `tech-stack.md` both describe a local mock OIDC/JWT issuer as local dev's Entra External ID stand-in, but no work item ever built it — `AUTH-001` referenced it as an environment dependency and assumed it existed. Same shape of gap as #5 above (described in an ADR, never actually tracked as buildable work). Closed by adding `AUTH-005`; further revised (Size S→M) once ADR-0011 (frontend framework) required a real PKCE browser redirect flow, not just direct token minting — see ADR-0006's amendment note and `WI-AUTH-005.md`.
7. **No frontend work items exist for `web-customer`/`web-admin` — identified 2026-09-12, resolved for `web-customer` on 2026-09-13.** *(2026-10-26: framework changed by ADR-0012, which supersedes ADR-0011; see the `EPIC-WEB-CUSTOMER` dispositions above.)* `apps/web-customer` had been scaffold-only; the only frontend item anywhere in the backlog was `QUE-002` (title-only). Resolved for the customer-facing side by ADR-0011 (frontend framework: React/Vite) plus `EPIC-WEB-CUSTOMER` (`WEB-001`, `CUST-002`, `CUST-003`, `CUST-004`) and a fully-detailed `QUE-002` sharing `WEB-001`'s scaffold. `web-admin` remains correctly unaddressed — its backend epics (`EPIC-ADMIN`, `EPIC-VENDOR-ONBOARDING`) don't exist yet, so there's nothing yet for an admin frontend to call.
8. **Two small local-scope design choices surfaced while detailing Batch 4 — not yet promoted, watch if they should be.** *(2026-10-26: (a) resolved by `WI-CAT-001` — a document per vendor in a reserved partition, not a cache; see `docs/evidence/WI-CAT-001/findings.md`.)* (a) Where `catalog-service` persists derived per-vendor verification status, given no admin-service exists yet to be the real source (`WI-CAT-001.md`'s Open Points; proposed default is a `CacheProvider`-backed entry). (b) The exact shape of `ORD-001`'s payment-step stub, so `PAY-001` has a clean seam later (`WI-ORD-001.md`'s Open Points). Neither rises to ADR-worthy yet — both are implementation-detail choices a work item's Open Points section is exactly meant to hold — but if either turns out to have wider implications once built, promote it rather than leaving it buried in a closed item's history.
9. **`worklog-2026-09-07.md`'s three named gaps — two resolved 2026-09-13, one still open.** Gap #1 (no work item for the .NET solution scaffold) closed by `WI-DEV-001` (new; triggered the `EPIC-LOCAL-DEV` renumbering documented in that epic's section above). Gap #3 (Batch 3 named as a concept but never actually scoped) partially closed — the domain-logic batch that worklog entry anticipated already shipped as this outline's **Batch 4** (walking skeleton, detailed 2026-09-12, before the worklog's own suggested batch was drafted independently); the worklog-suggested batch's *new* items not already covered by Batch 4 (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002`) are captured above as **Batch 5** — curated 2026-09-13, fully detailed and Ready for agents as of the same day. Gap #2 (the Batch 1 verification checkpoint living only as prose) **remains open** — tracked as a real, checkable entry in `PARKING-LOT.md` as of 2026-09-13, not yet promoted to a full work item or actually performed.
