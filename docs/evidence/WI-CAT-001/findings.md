# WI-CAT-001 Findings — Listing CRUD + modifier/allergy model

**Date:** 2026-10-26 · **Branch:** `feature/CAT-001-listing-crud` · **Code:** `services/catalog-service/` · **Result:** acceptance criteria met against in-memory backends; Cosmos and Redis paths wired but not run

## Acceptance results

| Criterion (`WI-CAT-001`, as amended by the 2026-10-26 reconciliation note) | Result | Evidence |
|---|---|---|
| `Listing` document with the contract fields | **Pass** | `Domain/ListingDocument.cs`; response shape asserted field-by-field (cents, `currency`, no `price`, no internal `version`) |
| `GET /catalog/listings`, `GET /catalog/listings/{id}` anonymous, `Published` only, verified vendors only (D-4) | **Pass** | Browse/detail tests: drafts, unknown ids, unverified and suspended vendors all excluded; paging by `limit`/`after` |
| `POST` (Vendor role) and `PUT` (Vendor role + ownership via `AUTH-002`'s pattern) | **Pass** | Missing, expired, forged-key and wrong-audience tokens → 401; Customer/Admin → 403; owner update persists; other vendor → the same 404 as a missing listing |
| `Published` only if the vendor is `Verified`, set via `VendorVerified`/`VendorSuspended` events, not client input | **Pass** | Publish rejected (409) before verification, accepted after the event; the request body has no way to set owner, status-from-vendor, `sponsored`, id or version |
| Suspension handling stated | **Pass** (choice below) | Suspended vendor: listings hidden, not rewritten; edit and unpublish allowed; publishing a draft rejected |

**Test run:** 28 tests, 0 failed (`dotnet test services/catalog-service/tests/CatalogService.Tests`). The shared-library suites still pass unchanged (Auth 23, Eventing 6, Caching 16, Data 8, EventSchemas 10, Logging 2, Secrets 5).

**The tests can fail.** Removing the publish gate, the stale-event check, and the `Published` browse filter each failed exactly the test written for it (3 of 28 failed); the code was restored and everything reran green. The running service was also smoke-tested as a real process: health, empty browse, 404 body, and 401 on an unauthenticated write.

## Open Points from the work item, resolved

1. **Where vendor verification status lives.** The work item's proposed default was a `CacheProvider` entry. **Rejected:** a cache is evictable (a lost entry would silently unpublish every listing of that vendor) and cannot enumerate vendors. Chosen: one small document per vendor in the `catalog` container, all in one reserved logical partition (`_vendor-status`), written only from events. This allows both a point-read and an enumeration through the existing single-partition `IRepository<T>` contract, with no change to shared libraries.
2. **Local-dev verification.** `DEV-004`'s seed publishing `VendorVerified` onto the backbone works with this service as built (it subscribes through `IEventSubscriber`). Not exercised yet; it needs `WI-DEV-002`.

## Design decisions (for review)

- **Suspension is a read-time filter**, stricter than the work item's minimum ("reject new publishes, don't force-unpublish"): suspended vendors' listings disappear from public reads but stay stored as `Published`, so reinstatement restores them with no data repair. Contract test 4 ("listings of a non-verified vendor never appear") needs this.
- **Event ordering** uses the envelope's per-aggregate `SequenceNumber`: an event is applied only if its sequence is higher than the last applied for that vendor. Duplicate and late events are ignored (tested).
- **Ownership is enforced twice**: writes are addressed in the caller's own partition (so another vendor's listing is not even found), and the explicit `ResourceOwnershipRequirement` from the shared library still runs.
- **REST DTOs are separate from stored documents** (Cosmos' serializer is case-sensitive about `id` and the partition path; the API should not expose `version`).
- **`ListingSponsored` is not emitted.** Nothing sets `sponsored` yet (Advertising, `ADV-*`); the field is stored only.

## Gaps found (not fixed here)

1. **Browse and lookup-by-id are not single-partition operations.** `catalog` is partitioned by `vendorId`; a public read has no vendor. The service reads one partition per verified vendor (browse) or probes each verified vendor's partition (lookup by id). Correct and fine at first-slice scale; it will not scale with vendor count. Fixes to choose between later: embed the vendor in the listing id, add an optional cross-partition query to `IRepository<T>` (a shared-contract change), or add a read-model keyed for browse.
2. **The shared Redis transport's consumer group is named per event type (`cg:{eventType}`), not per service.** If two services subscribe to the same event they would compete for messages instead of each receiving all of them. Harmless today (only catalog consumes `VendorVerified`); it will bite when `ordering-service` or `notification-service` subscribes to a shared event. Belongs to `WI-EVT-003`'s code.
3. **No outbox.** Save and `ListingPublished` publish are two steps; a failed publish is logged and never re-emitted. Acceptable for the slice; needed before anything depends on the event.
4. **No optimistic concurrency.** `IRepository<T>` exposes no ETag, so concurrent PUTs are last-write-wins, and concurrent deliveries for one vendor are a read-modify-write.
5. **Existing Cosmos tests use PascalCase `Id`/`PartitionKey`** with Cosmos' default serializer, which requires lowercase `id`. They may only be passing through the fake fallback (reconciliation finding A8). Worth confirming when the emulator is in `WI-DEV-002`. This service avoids the issue with explicit property names.

## Not verified

- `Data:Backend=cosmos` and `Events:Backend=redis` are wired but never run (no emulator or Redis in this environment); the `catalog` container's partition-key path must be `/vendorId`, and the Cosmos LINQ translation of the status filter is untested.
- The real mock OIDC issuer: tests use the real `AddBakeryAuth` middleware with a test signing key, not the issuer's discovery flow. The Development authority `http://localhost:5100` is a placeholder.
- Request-size limits, rate limiting, and logging of request bodies (none are logged).
- `nfrs.md` latency targets; no performance test.

## Reproduce

`dotnet test services/catalog-service/tests/CatalogService.Tests`, and see `services/catalog-service/README.md` for running the service.
