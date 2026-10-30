# Delegation Packet 07 — Independent Domain Model Items (Catalog, Preferences, Vendor)

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

**Item(s) covered**: `WI-CAT-001` (Listing CRUD + modifier/allergy model), `WI-PREF-001` (Preference Profile CRUD), `WI-VEN-001` (Vendor profile + application)
**Full specs**: `docs/product/backlog/WI-CAT-001.md`, `WI-PREF-001.md`, `WI-VEN-001.md` — condensed here; those files win on conflict.
**AI-agent suitability**: Yes for `PREF-001`/`VEN-001` (no open judgment calls). Partial for `CAT-001` — see its own flagged Open Point below; don't resolve it silently if assigned.
**Delegation wave**: independent of Packets 05 and 06, and of each other. No shared code between the three bounded contexts (Catalog, Preferences, Vendor Onboarding all live in different containers — `catalog`/`preferences`/`vendors` respectively).
**Why grouped, not split**: same task shape (a bounded context's first CRUD implementation against an already-frozen `IRepository<T>`), and every code-level blocker each one has (`DATA-002`, `EVT-003`, `AUTH-002`, `DEV-001`) is already done — none of these three needs `WI-AUTH-005` or `WI-DEV-002` to exist to be *built*, only to be locally *integration-tested* later. If splitting across three agents, no coordination needed between them; if assigning to one, build in any order.

## Build this — `WI-CAT-001`

`Listing` document per `docs/architecture/data-model-api-contracts.md`: `id, vendorId, name, description, price, category, modifiers[], allergenFlags[], sponsored, status, createdAt, updatedAt`.

Endpoints: `GET /catalog/listings`, `GET /catalog/listings/{id}`, `POST /catalog/listings` (Vendor role), `PUT /catalog/listings/{id}` (Vendor role + ownership check via `AUTH-002`'s existing pattern — see `tools/BakeryMarketplace.Auth/ListingOwnershipReferenceExample.cs`, already built for exactly this endpoint).

A listing can only reach `Published` status if its owning vendor's tracked status is `Verified` — set via consuming `VendorVerified`/`VendorSuspended` events (`IEventSubscriber`), never by trusting a client-supplied flag. Consuming `VendorSuspended` for an already-`Published` listing's vendor should reject further publishes for that vendor; do not force-unpublish existing listings (this is the spec's own stated default — state it explicitly in your implementation notes rather than silently picking a different behavior).

**Flagged, not resolved — do not pick silently**: where does `catalog-service` persist derived per-vendor verification status? The spec's own Open Points propose a `CacheProvider`-backed entry (reuses the already-built `RedisCacheProvider`/`ResilientCacheProvider`, no new container) as the reasonable default, but this hasn't been confirmed as a settled decision anywhere. If you proceed with the `CacheProvider` default, say so explicitly in your PR/output notes so it's confirmed rather than silently baked in.

For local end-to-end testing, no admin-service verification flow exists yet — `DEV-004`'s seed script is the interim substitute (publishes `VendorVerified` directly for seeded vendors). This is acceptable and already decided; don't block on `VEN-002` existing.

## Build this — `WI-PREF-001`

`PreferenceProfile` document per `data-model-api-contracts.md`: `id, customerId, allergies[], dietaryPreferences[], updatedAt`.

Endpoints: `GET /catalog/preferences/{customerId}`, `PUT /catalog/preferences/{customerId}` — both Customer role + resource-ownership check via `AUTH-002`'s pattern. A customer with no existing profile gets a sensible empty-profile response on `GET` (empty arrays, not a 404) — the profile is implicitly created on first `PUT`, no separate `POST`. Free-form string arrays for both fields — no controlled vocabulary in v1.

## Build this — `WI-VEN-001`

`VendorProfile` document per `data-model-api-contracts.md`: `id, vendorId, name, vendorType ("Shop"|"Independent"), verificationStatus ("Pending"|"Verified"|"Suspended"), contactInfo, complianceChecklist: {}, createdAt, updatedAt`.

- `POST /admin/vendors` (Vendor role) — creates a new `VendorProfile` with `verificationStatus: "Pending"`; a caller who already has one gets a clean conflict response, not a silent duplicate
- `GET /admin/vendors/{vendorId}` / `PUT /admin/vendors/{vendorId}` (Vendor role + ownership check) — a vendor views/edits their own profile; `PUT` covers `name`/`contactInfo`/`complianceChecklist` only — **does not** allow the caller to set their own `verificationStatus` (that's `VEN-002`'s job, server-controlled)
- `vendorType` is set at application time and immutable afterward

**Flagged, not resolved**: `complianceChecklist`'s actual required contents for Independent vendors aren't decided anywhere. Store whatever structure is submitted (an open `{}` object) without validating specific required fields — don't invent a schema.

## Scope boundaries (read before touching code)

- **`CAT-001`**: does not implement dietary-preference filtering at query time (`SRCH-001`, separate), the admin moderation queue (`ADM-*`, separate), or cache-aside reads (`CAT-003`, separate, blocked by this item)
- **`PREF-001`**: does not publish a Preference Snapshot anywhere (`PREF-002`, separate, blocked by this item) or implement filtering (`SRCH-001`)
- **`VEN-001`**: does not implement the verification workflow itself — no `/verify`/`/suspend` endpoints, no `VendorVerified`/`VendorSuspended` publishing (`VEN-002`, separate, blocked by this item)
- **You do not need**, for any of the three: each other's bounded-context internals, or any frontend/UI concern

## Where to look (pointers, not restated)

- `docs/architecture/data-model-api-contracts.md` — the authoritative shapes and endpoints for all three
- `tools/BakeryMarketplace.Data/IRepository.cs`, `CosmosRepository.cs` — the already-built persistence layer all three use
- `tools/BakeryMarketplace.Auth/ResourceOwnershipHandler.cs`, `ListingOwnershipReferenceExample.cs` — the already-built ownership-check pattern (`CAT-001` has a worked reference example already; reuse the same shape for `PREF-001`/`VEN-001`)
- `services/catalog-service/src/`, `services/admin-service/src/` — the real project scaffolds (`WI-DEV-001`, done) each of these adds code to

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`) for each item, plus: any flagged-not-resolved point above must appear explicitly in the item's own output notes, not be silently decided.
