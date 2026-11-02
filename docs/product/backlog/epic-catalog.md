# Epic catalog

> **Status:** Current · the epics and their planned items, as last edited by hand on 2026-10-26 to 2026-10-30. Item status words in the lines below can lag. For any item that has a spec, `STATUS.md` (generated from the spec banners) is the source of truth; the epic lines below say which items exist and what they are for.

Where the work stands now: `current-plan.md`. Earlier versions of this file also held the agent-ready queue, the batches, the build order and nine "gaps" notes; those are in `docs/history/backlog-outline-2026-10-29.md`.

Legend: 🟢 detail known now (from an existing ADR/decision) · ⚪ title only, detail TBD when picked up · ✅ detailed (Ready or Done; see `STATUS.md`)

## Portfolio Slice Epic

### EPIC-PORTFOLIO-SLICE — see `EPIC-PORTFOLIO-SLICE.md` (added 2026-10-26)
Scope: cross-cutting · Primary hat(s): Architect, Engineering/Build, Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ PORT-001 to PORT-007 — see `STATUS.md`

---

## Domain / Product Epics

### EPIC-CATALOG — Catalog & Customization
Scope: Catalog · Primary hat(s): Architect, Engineering/Build · Status: see [STATUS.md](STATUS.md)
- ✅ CAT-001 (Service Implementation) — **Done 2026-10-26** (anonymous reads, integer cents, vendor-verification publish gate; evidence `docs/evidence/WI-CAT-001/findings.md`), see `WI-CAT-001.md` — Listing CRUD + modifier/add-in model, allergy flags per item (per glossary: Listing, Modifier, Allergy Flag); has two Open Points on vendor-verification-status storage and the local-dev seed dependency
- ⚪ CAT-002 (Service Implementation) — Coffee/bakery customization flow (modifier selection UI + validation)
- ✅ CAT-003 (Integration) — **Detailed, Ready for agents**, see `WI-CAT-003.md` — Consumes `CacheProvider` (EPIC-CACHING) for listing reads. **ADJUSTED (minor) 2026-10-26**: retained as ADR-0014 layer 1; record per-cache contract fields
- ⚪ CAT-004 (Service Implementation) — Catalog moderation queue hooks (feeds EPIC-ADMIN)
- ✅ CAT-005 (Service Implementation) — **Built 2026-10-28, merged to main** (71 catalog tests, verified on the real Cosmos emulator; adds optimistic concurrency to `BakeryMarketplace.Data`), see `WI-CAT-005.md` — listing stock fields (`availableQuantity`, `maxPerOrder`, `lowStockThreshold`), vendor set/increment/decrement, stock status on reads (ADR-0017)
- ✅ CAT-006 (Service Implementation) — **Built 2026-10-28, merged to main** (101 catalog tests; verified end to end on the real stack with a client-credentials token), see `WI-CAT-006.md` — atomic stock reserve and release endpoints for ordering (ADR-0017); the caller is `ORD-001`

### EPIC-SEARCH — Search & Discovery
Scope: Search & Discovery · Primary hat(s): Architect, Digital PM · Status: see [STATUS.md](STATUS.md)
- ✅ SRCH-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-SRCH-001.md` — dietary-preference filtering, consumes `PREF-002`'s Preference Snapshot in-process; flags conflicts by default, `hideConflicts` opt-in
- 🟢 SRCH-002 (Integration) — Blend sponsored placement into results (Partnership relationship w/ Advertising, per bounded context map)
- ⚪ SRCH-003 (Service Implementation) — Ranking logic, organic vs. sponsored

### EPIC-PREFERENCES — Preferences & Dietary Safety
Scope: Preferences & Dietary Safety · Primary hat(s): Architect, Digital PM · Status: see [STATUS.md](STATUS.md)
- ✅ PREF-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-PREF-001.md` — Preference Profile CRUD
- ✅ PREF-002 (Integration) — **Detailed, Ready for agents**, see `WI-PREF-002.md` — Publish Preference Snapshot via Open Host Service (per bounded context map) to Search + Ordering; named a new event (`PreferenceSnapshotPublished`) while detailing, added to `glossary.md`/`data-model-api-contracts.md` in the same pass

### EPIC-ORDERING — Ordering & Fulfillment (pickup v1)
Scope: Ordering & Fulfillment · Primary hat(s): Architect, Engineering/Build · Status: see [STATUS.md](STATUS.md)
- ✅ ORD-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-001.md` — Cart + checkout, payment step explicitly stubbed pending `EPIC-PAYMENTS`
- ✅ ORD-002 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-002.md` — Order aggregate + lifecycle states (`Pending → Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` or `Cancelled`, per ADR-0001; **built 2026-10-28**, see the outcome note in `WI-ORD-002.md`)
- ✅ ORD-003 (Service Implementation) — **Detailed, Ready for agents**, see `WI-ORD-003.md` — Pickup Window scheduling (PickupFulfillment strategy, per ADR-0001)
- ✅ ORD-004 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-ORD-004.md` — `FulfillmentStrategy` interface (the ACL boundary itself, per ADR-0001) — this is the seam a future Delivery strategy would plug into, and the top of this epic's critical path
- ✅ ORD-005 (Integration) — **Built 2026-10-28, merged to main**, see `WI-ORD-005.md` — Publish domain events (`OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted` per ADR-0003/glossary) via the event backbone (EPIC-EVENTING)
- ✅ ORD-006 (Integration) — **Detailed, Ready for agents**, see `WI-ORD-006.md` — Consumes `Repository<T>` for Cosmos-backed persistence (EPIC-DATA-STORE)
- ✅ ORD-007 (Service Implementation) — **Built 2026-10-28, merged to main**, see `WI-ORD-007.md` — order action endpoints (vendor confirm, decline, start, ready, complete, cancel; customer cancel)
- ✅ ORD-008 (Service Implementation) — **Built 2026-10-28, merged to main**, see `WI-ORD-008.md` — automatic confirmation of orders with no options and no requested pickup window

### EPIC-QUEUE-DISPLAY — Live Order-Queue Display
Scope: Ordering & Fulfillment (read-side) · Primary hat(s): Architect, Engineering/Build · Status: see [STATUS.md](STATUS.md)
- ✅ QUE-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-QUE-001.md` — Read-model built from order events, not a direct query against the `orders` container (per ADR-0004's CQRS decision)
- ✅ QUE-002 (Service Implementation) — **Detailed, Ready**, see `WI-QUE-002.md` — polling-based live UI (5–10s interval), real-time push (WebSockets/SignalR) explicitly named as a v2 candidate; shares `WEB-001`'s scaffold/auth pattern rather than a second bespoke frontend. **ADJUSTED 2026-10-26**: Next.js (client-rendered) via BFF, builds on `PORT-002`'s scaffold
- ✅ QUE-003 (Service Implementation) — **Done 2026-11-02**, see `WI-QUE-003.md` — live updates to the vendor queue by push over a stream, polling kept as the fallback (ADR-0021); run on the real local stack (a customer's order on the vendor's screen about 170 ms after the request); approved by the lead after a review round

### EPIC-WEB-CUSTOMER — Customer-Facing Web App
Scope: Catalog & Customization, Preferences & Dietary Safety, Ordering & Fulfillment (customer-facing UI only — backend logic lives in catalog-service/ordering-service) · Primary hat(s): Engineering/Build, Architect · Status: see [STATUS.md](STATUS.md)
- ⛔ WEB-001 (Service Implementation) — **SUPERSEDED 2026-10-26** by `WI-PORT-001`/`WI-PORT-002` (ADR-0012); PKCE/in-memory-token requirements carry forward. Was: **Detailed, Ready**, see `WI-WEB-001.md` — shared React/Vite scaffold + PKCE auth pattern, shared with `EPIC-QUEUE-DISPLAY` (`QUE-002` builds on this same scaffold); blocked by `WI-AUTH-005` (revised)
- ✅ CUST-002 (Service Implementation) — **Detailed, Ready**, see `WI-CUST-002.md` — listing browse/detail view, allergy flags/modifiers surfaced prominently per vision principle 1. **ADJUSTED 2026-10-26**: SSR Next.js page via BFF/Relay; blocked by `PORT-002`/`PORT-007` instead of `WEB-001`
- ✅ CUST-003 (Service Implementation) — **Built 2026-10-28, merged to main** (checkout UI; real-stack journey is `S1-07`), see `WI-CUST-003.md` — cart/checkout UI against `ORD-001`'s stubbed payment step, with an unmissable demo/test-mode banner. **ADJUSTED 2026-10-26**: client-rendered, GraphQL mutation per `PORT-007`; blocked by `PORT-002`/`PORT-007`
- ✅ CUST-004 (Service Implementation) — **Done 2026-10-28, merged to main** (order status page; rewritten as-built 2026-10-30), see `WI-CUST-004.md` — order confirmation + order status view. The order history list was split out as `CUST-007` (2026-10-30). **ADJUSTED 2026-10-26**: client-rendered via BFF; blocked by `PORT-002`/`PORT-007`
- ✅ CUST-005 (Service Implementation) — **Detailed, Ready — added 2026-09-14 (Batch 6, M4)**, see `WI-CUST-005.md` — preferences/dietary-profile UI, shared with `EPIC-PREFERENCES`. **ADJUSTED 2026-10-26**: client-rendered via BFF; blocked by `PORT-002`
- ✅ CUST-006 (Service Implementation) — **Detailed, Ready — added 2026-09-14 (Batch 6, M4)**, see `WI-CUST-006.md` — personalized allergen highlighting + hide-conflicts toggle on `CUST-002`'s browse view, shared with `EPIC-SEARCH`. **ADJUSTED 2026-10-26**: via BFF; personalized responses `private, no-store` (ADR-0014)
- ⚪ CUST-007 (Service Implementation) — **Detailed, Ready — added 2026-10-30**, see `WI-CUST-007.md` — customer order history list (`orders` query in ordering-service and the BFF, and a page); split out of `CUST-004`, register item 80.

See `EPIC-WEB-CUSTOMER.md` for the full epic record.

### EPIC-FULFILLMENT-EXT — Delivery/Dispatch (v2, deferred)
Scope: Ordering & Fulfillment (future) · Primary hat(s): Architect · Status: Deferred (by design, not a gap)
- 🟢 FUL-001 (Document/Artifact) — Only item planned for now: keep ADR-0001 current if delivery requirements firm up before this is actually scheduled. No build items exist yet on purpose.

### EPIC-VENDOR-ONBOARDING — Vendor Onboarding & Verification
Scope: Vendor Onboarding & Verification · Primary hat(s): Architect, Digital PM · Status: see [STATUS.md](STATUS.md)
- ✅ VEN-001 (Service Implementation) — **Detailed, Ready for agents**, see `WI-VEN-001.md` — Vendor profile + application (`VendorType`: Shop | Independent per glossary); also added `POST/GET/PUT /admin/vendors...` endpoints to `data-model-api-contracts.md`, a small gap (no `ApplyAsVendor` endpoint existed anywhere) resolved while detailing
- ✅ VEN-002 (Service Implementation) — **Detailed, Ready for agents**, see `WI-VEN-002.md` — Verification status workflow (`Pending → Verified` / `Suspended`), publishes `VendorVerified`/`VendorSuspended`. **Note**: `CAT-001` and `DEV-004` currently work around this not existing yet by having the seed script publish `VendorVerified` directly for local e2e; this item is the real implementation, and both coexisting is treated as intentional (see this item's own Open Points), not a gap to close immediately.
- 🟢 VEN-003 (Integration) — Stripe Connect Express onboarding flow (per ADR-0005) — store only the resulting connected-account ID + status, not raw KYC data

### EPIC-ADVERTISING — Advertising / Promotions
Scope: Advertising/Promotions · Primary hat(s): Digital PM, Architect · Status: Not Started · Hosted in: `catalog-service` (ADR-0009)
- ⚪ ADV-001 (Service Implementation) — Sponsored slot assignment (MVP-lite per docs/product/scope.md — simple flag, no bidding engine)
- ⚪ ADV-002 (Document/Artifact) — Monetization model detail (commission % vs. ad revenue split) — overlaps with EPIC-PRODUCT-STRATEGY, listed in both deliberately (see gap note below)

### EPIC-PAYMENTS — Payments & Payouts
Scope: Payments & Payouts · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- 🟢 PAY-001 (Integration) — Stripe Connect destination charges + `application_fee_amount` commission split (ADR-0005) — this is what `ORD-001`'s payment-step stub is designed to be replaced by
- 🟢 PAY-002 (Service Implementation) — `payouts` container as reconciliation read-model, populated via Stripe webhooks (ADR-0004 + ADR-0005)
- 🟢 PAY-003 (Test/Mock/Chaos) — Webhook idempotency tests (dedupe on Stripe event ID, same pattern as ADR-0003's event dedupe)
- ⚪ PAY-004 (Service Implementation) — Basic refund initiation (chargebacks explicitly out of scope per ADR-0005 / Open Item #6)

### EPIC-REVIEWS — Reviews / Trust
Scope: Reviews/Trust · Primary hat(s): Digital PM · Status: Not Started · Hosted in: `ordering-service` (ADR-0009)
- ⚪ REV-001 (Service Implementation) — Basic rating tied to completed Order + Vendor (MVP-lite; fraud/trust scoring deferred per docs/product/scope.md)

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
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ EVT-001 (Interface/Contract) — **Done**, see `WI-EVT-001.md` — `IEventPublisher`/`IEventSubscriber` interfaces + envelope shape (ADR-0003), real C# per ADR-0010. **ADJUSTED 2026-10-26**: envelope gains `traceparent` (ADR-0016), tracked in `PORT-005`
- 🟢 EVT-002 (Service Implementation) — `EventGridPublisher`/`EventGridSubscriber` (cloud) — deprioritized behind `EVT-003`, not needed for local e2e
- ✅ EVT-003 (Service Implementation) — **Done (2026-09-15)**, see `WI-EVT-003.md` — `RedisStreamsPublisher`/`Subscriber` (local Redis Streams transport with consumer groups and dead-lettering)
- ⚪ EVT-004 (Test/Mock/Chaos) — Contract-test suite + `ChaosEventTransport` (duplicate/out-of-order/delayed/dropped delivery, per ADR-0003) — blocked by `EVT-003`
- ⚪ EVT-005 (Infra/Environment) — Terraform Event Grid custom topic + subscription filters

### EPIC-DATA-STORE — Cosmos DB Repositories
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ DATA-001 (Interface/Contract) — **Done**, see `WI-DATA-001.md` — `IRepository<T>` interface (ADR-0004), real C# per ADR-0010
- ✅ DATA-002 (Service Implementation) — **Done (2026-09-15)**, see `WI-DATA-002.md` — `CosmosRepository<T>` implementation using Cosmos SDK directly with LINQ query provider
- 🟢 DATA-003 (Test/Mock/Chaos) — `FakeRepository<T>` + contract tests against the Cosmos emulator — `FakeRepository<T>` already exists from `DATA-001`; the emulator-based contract-test run is the remaining piece. **Unblocked 2026-10-26** by `DEV-002`. First job: fix the test entity (`Id` serializes as `Id`, Cosmos needs `id`) and the silent skip — the current Cosmos tests pass without touching Cosmos and 3 of 4 fail against the real emulator (`docs/operations/local-dev.md`)
- ⚪ DATA-004 (Infra/Environment) — Terraform Cosmos account + per-container partition key config

### EPIC-AUTH — Auth/Authz
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ AUTH-001 (Interface/Contract) — **Done**, see `WI-AUTH-001.md` — JWT middleware + ownership checker, real C# per ADR-0010; explicitly unaffected by the pending Entra External ID swap (open item #21)
- ✅ AUTH-002 (Service Implementation) — **Done (2026-09-15)**, see `WI-AUTH-002.md` — ResourceOwnershipRequirement & ResourceOwnershipHandler<TResource> with role short-circuiting + reference example
- 🟢 AUTH-003 (Test/Mock/Chaos) — Deterministic tests: expired/tampered/malformed token handling (ADR-0006 — explicitly not a live chaos decorator, see ADR's own reasoning)
- 🛑 AUTH-004 (Infra/Environment) — **HOLD — do not assign to agents.** Tenant + policy configuration — targets Microsoft Entra External ID, not Azure AD B2C, per open item #21. Held until that migration decision is finalized. Confirmed 2026-09-12 that this hold is unaffected by anything in Batch 3/4 — Entra confirmation covers the *cloud* tenant only.
- ✅ AUTH-005 (Service Implementation) — **Detailed, Ready for agents — revised 2026-09-13**, see `WI-AUTH-005.md` — Local mock OIDC/JWT issuer for dev. Closed a real gap identified 2026-09-12: ADR-0006/`tech-stack.md` describe this issuer, nothing had ever built it. Fully independent of the Entra swap. **Revised Size S→M on 2026-09-13**: ADR-0011 (frontend framework) requires a real browser PKCE authorization-code redirect flow, not just direct token minting — folded into this item's spec directly (see ADR-0006's corresponding amendment note) since nothing had started building it yet. Now shared with `EPIC-WEB-CUSTOMER` (`WEB-001` depends on it for the browser login flow).
- 🟢 AUTH-007 (Service Implementation) — **In progress (phase 1 built 2026-11-02)**, see `WI-AUTH-007.md` — browser sessions: a server-side session behind an HttpOnly cookie, renewal on the server, one shared implementation for both web apps (backlog N-01, ADR-0019, register items 24, 115, 116); ADR-0019 Accepted 2026-11-02
- 🟢 AUTH-006 (Service Implementation) — **Added 2026-10-28**, see `WI-AUTH-006.md` — OAuth2 client credentials for service callers: mock issuer, shared library, local secret tooling (phase 1, **built 2026-10-28**, 80 Auth tests); DEV app registrations and credential (phase 2, after the ADR-0018 verification)

### EPIC-SECRETS — Secrets Management
Scope: cross-cutting (all contexts) · Primary hat(s): Platform Engineering · Status: see [STATUS.md](STATUS.md)
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
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ TOOL-001 (Interface/Contract) — **Done**, see `WI-TOOL-001.md` — domain event payload records, fully independent of batch 1
- ✅ TOOL-002 (Interface/Contract) — **Done**, see `WI-TOOL-002.md` — correlation-ID middleware + structured logging convention. **ADJUSTED 2026-10-26**: ID source becomes the W3C trace ID (ADR-0016); follow-up code change tracked in `PORT-005`
- 🟢 TOOL-003 (Interface/Contract) — `/tools/auth-middleware` — same item as `AUTH-001`, already detailed and Done there (see `WI-AUTH-001.md`); this line stays as the deliberate cross-listing pointer, not a duplicate
- ⚪ TOOL-004 (Service Implementation) — Shared fault-injection harness (used by EPIC-CACHING, EPIC-EVENTING, EPIC-DATA-STORE chaos items)

---

## Platform Engineering / Delivery Infrastructure Epics

### EPIC-LOCAL-DEV — Local Development Environment
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ✅ DEV-001 (Infra/Environment) — **Done (2026-09-15)**, see `WI-DEV-001.md` — Base .NET solution/project scaffold (one Web API project per service, per ADR-0010) — resolves `worklog-2026-09-07.md`'s gap #1. Also carries `WI-WEB-001`'s CORS open point as a concrete acceptance criterion. Unblocks all of Batch 4.
- ✅ DEV-002 (Infra/Environment) — **Done 2026-10-26** (verified under Docker; `docs/operations/local-dev.md`), see `WI-DEV-002.md` — Real `docker-compose.yml`: Redis Streams (default), Cosmos emulator (default), mock OIDC issuer (default, `AUTH-005`), cache Redis (profile-gated), per ADR-0002/0003/0004/0006. **ADJUSTED 2026-10-26**: also the Next.js app(s), the GraphQL BFF and a local trace viewer once built; no APIM stand-in (`GW-005` obsolete). **Renumbered 2026-09-13 from `DEV-001` to `DEV-002`** — content unchanged, see the note below.
- 🟢 DEV-003 (Infra/Environment) — Stripe CLI webhook forwarding setup (ADR-0005) — deprioritized behind the walking skeleton, since `ORD-001`'s payment step is stubbed for now; needed once `PAY-001` is picked up. **Renumbered 2026-09-13 from `DEV-002` to `DEV-003`** — title-only, no content to change.
- ✅ DEV-004 (Infra/Environment) — **Detailed, Ready for agents**, see `WI-DEV-004.md` — Seed/fixture data script, including publishing `VendorVerified` for seeded vendors as the interim local substitute for `EPIC-VENDOR-ONBOARDING` not existing yet. **Renumbered 2026-09-13 from `DEV-003` to `DEV-004`** — content unchanged apart from updated cross-references.
- ⚪ DEMO-001 (Document/Artifact) — Demo path: script, checklist, topology and a cold run — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-DEMO-001.md` (In review, 2026-10-30)

**Renumbering note (2026-09-13)**: `worklog-2026-09-07.md`'s recommended fix for gap #1 (no work item for the .NET solution scaffold) proposed calling that new item `WI-DEV-001` — a reasonable, independently-chosen ID that happened to collide with the `docker-compose.yml` item already assigned `DEV-001` in this same epic during the 2026-09-12 session. Rather than force the new, more foundational item into a later slot, the existing three `EPIC-LOCAL-DEV` items were shifted up by one (`DEV-001→002`, `DEV-002→003`, `DEV-003→004`) so `DEV-001` numerically reflects what actually has to exist first. No file's *content* changed as part of this beyond fixing the small number of internal cross-references that named the old IDs (see each renamed file's own note).

### EPIC-CI-CD — CI/CD Pipeline
Scope: repo-level · Primary hat(s): Platform Engineering · Status: Not Started · **2026-10-26: CI/CD system of record is Azure Pipelines (ADR-0015); GitHub stays source control**
- ⛔ CI-001 (Infra/Environment) — **SUPERSEDED 2026-10-26** by `WI-PORT-003`. Was: Real build/test stages, replacing the current placeholder
- ⚪ CI-002 (Infra/Environment) — OIDC federated deploy step per environment. **ADJUSTED 2026-10-26**: Azure Pipelines service connection using workload identity federation (ADR-0015, ADR-0007 amendment)
- ⚪ CI-003 (Infra/Environment) — Ephemeral/preview environment, at least one working example (Open Item #15). **ADJUSTED 2026-10-26**: built on Azure Pipelines; must include the Next.js app and BFF
- ✅ CI-004 (Infra/Environment) — **Done 2026-10-28**: `ci.yml` removed; required-check repointing waived as a soft manual gate (enterprise plan needed for rulesets), see ADR-0015 amendment. Was: **Added 2026-10-26**: GitHub Actions → Azure Pipelines migration cut-over — repoint required checks, update docs, remove `.github/workflows/ci.yml` in one commit, once ADR-0015's exit criteria are met
- ⚪ SEC-004 (Document/Artifact) — Pipeline security checks and Terraform validation — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-SEC-004.md` (Deferred, 2026-10-30)

### EPIC-CLOUD-INFRA — Terraform / Cloud Environments
Scope: cross-cutting · Primary hat(s): Platform Engineering, Architect · Status: Not Started
- ⚪ INFRA-001 (Infra/Environment) — Per-environment `.tfvars` (dev/staging/prod), matching existing `/infra/environments` scaffold
- ⚪ INFRA-002 (Infra/Environment) — Container Apps compute + Static Web Apps frontend hosting (per tech-stack.md). **ADJUSTED 2026-10-26**: Static Web Apps no longer fits Next.js SSR; frontend + BFF need Node-capable hosting (Container Apps the default candidate, decided here) — ADR-0012/0013
- ⚪ DEP-001 (Document/Artifact) — Deployment path: images, deploy stage, dev environment, post-deploy smoke — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-DEP-001.md` (In progress, 2026-10-31)

### EPIC-REPO-OPS — Repo/Tooling Meta-Infrastructure
Scope: repo-level · Primary hat(s): Manager/Lead, Platform Engineering · Status: Not Started
- ⚪ REPO-001 (Infra/Environment) — Publish docs site via GitHub Pages (`mkdocs gh-deploy` or Pages Action) — `mkdocs.yml` already ready (Open Item #13). **ADJUSTED 2026-10-26**: GitHub Pages hosting is still fine; the publish step runs from Azure Pipelines or a manual `mkdocs gh-deploy`, not a GitHub Actions workflow (ADR-0015)
- ⚪ REPO-002 (Infra/Environment) — GitHub Projects board setup (`Backlog → Ready → In Progress → Review → Done`, per docs/product/scope.md) (Open Item #12)
- ⚪ REPO-003 (Document/Artifact) — Review how deferred items, set-aside notes and ideas, and delegated-work findings are captured (parking lot, register, deferred specs, intake) — added 2026-10-30; spec: `WI-REPO-003.md` (Deferred, 2026-10-30)
- ⚪ DOC-001 (Document/Artifact) — Method documents, templates, checklists and standards not yet written — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-DOC-001.md` (Deferred, 2026-10-30)
- ⚪ EVID-001 (Document/Artifact) — Extract proof from specs into evidence records — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-EVID-001.md` (Deferred, 2026-10-30)

---

## Architecture & Operations Artifact Epics

### EPIC-ARCH-DOCS — Remaining Architecture Documents
Scope: cross-cutting-artifact · Primary hat(s): Architect · Status: see [STATUS.md](STATUS.md)
- ✅ NFR-001 (Document/Artifact) — **Done**, see `docs/architecture/nfrs.md` + `WI-NFR-001.md`
- ✅ ARCH-001 (Document/Artifact) — **Done**, see `docs/architecture/c4/context.md` + `container.md` — surfaced and resolved a bounded-context-to-service mapping gap, formalized as ADR-0009
- ✅ ARCH-002 (Document/Artifact) — **Done**, see `docs/architecture/capability-map.md` + `WI-ARCH-002.md` — business-facing re-grouping of `bounded-contexts.md`, consistent with ADR-0009's service mapping
- ✅ ARCH-003 (Document/Artifact) — **Done**, see `docs/architecture/data-model-api-contracts.md` + `WI-ARCH-003.md` — per-service Cosmos document shapes, events, and API endpoints; resolved the event-dedupe store location (CacheProvider) and made the ADR-0004 read-model split concrete (`order-status-readmodel`)
- ✅ ARCH-004 (Document/Artifact) — **Done**, see `docs/architecture/ddd/event-storming.md` + `WI-ARCH-004.md` — surfaced 4 previously-unnamed events (`ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected`), added to glossary.md and `data-model-api-contracts.md`
- ⚪ ARCH-005 (Document/Artifact) — Component-level C4 diagrams for `ordering-service` and `catalog-service`, explicitly deferred from `WI-ARCH-001`'s scope — logged now so it's tracked rather than just remembered — **done 2026-10-30** as `docs/architecture/c4/component-services.md` (no spec)
- ⚪ DOC-002 (Document/Artifact) — Architecture and contract reference gaps — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-DOC-002.md` (Deferred, 2026-10-30)
- ⚪ API-001 (Document/Artifact) — Machine-readable API specification and contract tests — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-API-001.md` (Deferred, 2026-10-30)

### EPIC-OPS-ARTIFACTS — Operations/SRE Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Operations · Status: see [STATUS.md](STATUS.md)
- ✅ OPS-001 (Document/Artifact) — **Done**, see `docs/operations/sla.md` + `WI-OPS-001.md` — 99.0% monthly target, error budget policy, latency targets, known failure modes, all traced to `nfrs.md`/ADRs
- ⚪ OPS-002 (Document/Artifact) — Runbook, tied to a real failure mode from the ADRs (candidates: Redis fallback per ADR-0002, Cosmos throttling per ADR-0004) — spec: `WI-OPS-002.md` (Done, 2026-10-30)
- ✅ OPS-003 (Document/Artifact) — **Done**, see `docs/operations/monitoring-alerting.md` + `WI-OPS-003.md` — policy layer (thresholds), distinct from `EPIC-OBSERVABILITY`'s implementation layer
- ⚪ OPS-004 (Document/Artifact) — On-call pattern doc (hypothetical)

### EPIC-GOVERNANCE — Governance Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Governance · Status: see [STATUS.md](STATUS.md)
- ✅ (ongoing) `docs/governance/open-items-register.md` — active, not a discrete work item, a living document
- ✅ GOV-001 (Document/Artifact) — **Done**, see `docs/governance/architecture-review.md` + `WI-GOV-001.md` — this project's ADR lifecycle: how a decision is proposed, accepted, amended and superseded
- ⚪ GOV-002 (Document/Artifact) — Explicit scope decision on legal artifacts (Terms of Service, Privacy Policy): in or out for v1, and why. Never appeared anywhere before this review pass, not even as a "scoped out" note — worth an explicit decision either way rather than continued silence, especially given the playbook was deliberately generalized to work for real projects too.

---

## Manager/Lead & Product Strategy Epics

### EPIC-PM-ARTIFACTS — Manager/Lead Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Manager/Lead · Status: see [STATUS.md](STATUS.md)
- 🟡 MGMT-001 (Document/Artifact) — drafted, see `docs/management/project-plan.md` + `WI-MGMT-001.md` — 1 open decision (relative vs. calendar-date phasing)
- 🟡 MGMT-002 (Document/Artifact) — drafted, see `docs/management/risk-register.md` + `WI-MGMT-002.md` — 1 open decision (confirm likelihood/impact ratings)
- ⚪ MGMT-003 (Document/Artifact) — RACI (hypothetical team) — spec: `WI-MGMT-003.md` (Deferred, 2026-10-30)
- ✅ MGMT-004 (Document/Artifact) — **Done**, see `docs/process/engineering-standards.md` + `WI-MGMT-004.md`
- 🟡 MGMT-005 (Document/Artifact) — drafted, see `docs/management/budget-cost-estimate.md` + `WI-MGMT-005.md` — 1 open decision (labor/time cost, deliberately not invented)
- ⚪ MGMT-006 (Document/Artifact) — Team structure + hiring plan (hypothetical) — spec: `WI-MGMT-006.md` (Deferred, 2026-10-30)
- ✅ MGMT-007 (Document/Artifact) — **Done**, see `docs/management/stakeholder-communications-plan.md` + `WI-MGMT-007.md` — deliberately not blocked on `MGMT-006`
- ✅ MGMT-008 (Document/Artifact) — **Done**, see `docs/process/branching-strategy.md` + `WI-MGMT-008.md` — trunk-based + feature flags, repo-wide versioning; surfaced a new gap (API/URL versioning via APIM, not yet decided — see `PARKING-LOT.md`)

### EPIC-PRODUCT-STRATEGY — Digital PM Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Digital PM · Status: see [STATUS.md](STATUS.md)
- ✅ PROD-001 (Document/Artifact) — **Done**, see `docs/product/personas.md` + `WI-PROD-001.md`
- ⚪ PROD-002 (Document/Artifact) — Competitive scan — spec: `WI-PROD-002.md` (Proposed, 2026-10-30)
- ⚪ PROD-003 (Document/Artifact) — Monetization model — overlaps with `ADV-002` above; deliberately listed in both places rather than picking one home (see gap note below) — spec: `WI-PROD-003.md` (Proposed, 2026-10-30)
- ⚪ PROD-004 (Document/Artifact) — OKRs / success metrics (north-star safety metric already named in vision; needs the rest) — spec: `WI-PROD-004.md` (In review, 2026-10-30)

---

## Launch & Support Epic

### EPIC-GOLIVE-SUPPORT — Go-Live & Refinement
Scope: cross-cutting-artifact (post-MVP) · Primary hat(s): Operations, Manager/Lead · Status: Deferred (post-launch, by design)
- ⚪ LAUNCH-001 (Test/Mock/Chaos) — Incident/game-day drill (real incident if one occurs first; a deliberate drill otherwise)
- ⚪ LAUNCH-002 (Document/Artifact) — Postmortem from the above drill — spec: `WI-LAUNCH-002.md` (Proposed, 2026-10-30)
- 🟢 LAUNCH-003 (Document/Artifact) — Roadmap update naming delivery/dispatch (EPIC-FULFILLMENT-EXT) as the next planned extension
- 🟢 LAUNCH-004 (Service Implementation) — One feature-flagged iteration (uses `FLAG-001`), per `docs/product/scope.md`'s original refinement-phase step — this had dropped out of the outline until this review pass

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
- ⚪ DOC-003 (Document/Artifact) — Web data-fetching guide and the add-a-screen checklist — added 2026-10-30 to track gaps found by the documentation review; spec: `WI-DOC-003.md` (Deferred, 2026-10-30)

### EPIC-QUALITY-EVIDENCE — Test Strategy, Metrics and Experiments
Scope: cross-cutting-artifact · Primary hat(s): Engineering/Build, Platform Engineering · Status: see [STATUS.md](STATUS.md)
- ⚪ QA-001 (Document/Artifact) — Test strategy and guides — added 2026-10-30; spec: `WI-QA-001.md` (Done, 2026-10-30)
- ⚪ QA-002 (Document/Artifact) — Quality metrics and scripted baselines — added 2026-10-30; spec: `WI-QA-002.md` (In progress, 2026-10-30)
- ⚪ QA-003 (Document/Artifact) — Planned experiments: AI-assisted testing and the mobile question — added 2026-10-30; spec: `WI-QA-003.md` (Deferred, 2026-10-30)

### EPIC-BACKLOG-PLANNING — Backlog Meta-Work
Scope: cross-cutting-artifact · Primary hat(s): Product Owner · Status: Not Started
- ⚪ PLAN-001 (Document/Artifact) — Prioritization output (MoSCoW/RICE) applied to this master outline — listed as "Planned" in `project-log.md` but had fallen out of the outline itself until now — spec: `WI-PLAN-001.md` (Proposed, 2026-10-30)
- ⚪ PLAN-002 (Document/Artifact) — Sprint plan (first 2–3 sprints), depends on `PLAN-001` — spec: `WI-PLAN-002.md` (Deferred, 2026-10-30)
