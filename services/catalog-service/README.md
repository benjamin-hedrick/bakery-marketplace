# catalog-service

Listings, customization/modifiers, allergen flags and tags, stock, the customer's allergen profile, and the personalized read of listings.

**Status (2026-11-08): built, run locally only.** Listing CRUD, modifiers, allergen flags and the vendor-verification publish gate (`WI-CAT-001`); stock fields, vendor set and adjust, and public stock status (`WI-CAT-005`); atomic stock reserve and release for ordering, behind a service credential (`WI-CAT-006`, ADR-0017); a listing cache with invalidation (`WI-CAT-003`, in review); a catalog-owned tag registry with the closed allergen list (`WI-TAG-001` to `004`, ADR-0022); the customer's allergen profile and diet preferences (`WI-PREF-001`); and the personalized browse and detail reads that return each listing with its conflicts (`WI-SRCH-001`). Events leave through an outbox (the change and its event are stored in one write). Not built: search ranking and sponsored placement, a vendor-facing screen for listings and stock, and a published copy of a profile for other services (dropped by decision, `WI-PREF-002`). Evidence: `docs/evidence/WI-CAT-001/findings.md`, `docs/evidence/WI-CAT-003/`; components: `docs/architecture/c4/component-services.md`.

## Endpoints (money is integer cents, USD)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/catalog/listings?limit=&after=` | anonymous | `Published` listings of currently `Verified` vendors, ordered by id; `{ items, nextCursor }`; served through the listing cache |
| GET | `/catalog/listings/{id}` | anonymous | 404 for drafts, unknown ids, and listings of vendors that are not verified |
| GET | `/catalog/listings/mine`, `/catalog/listings/mine/{id}` | `Vendor` role | The vendor's own listings, drafts included |
| POST | `/catalog/listings` | `Vendor` role | Owner is the token `sub`; id, owner, `sponsored` and version are never client-settable |
| PUT | `/catalog/listings/{id}` | `Vendor` role + ownership | Replaces the mutable fields; another vendor's listing returns the same 404 as a missing one |
| POST | `/catalog/listings/{id}/stock/adjust` | `Vendor` role + ownership | Adjusts the stock count |
| POST, GET, DELETE | `/catalog/stock/reservations`, `/catalog/stock/reservations/{orderId}` | service credential (`Stock.Reserve`) | Atomic reserve and release for ordering; idempotent per order id |
| GET | `/catalog/tags?kind=` | anonymous | The registry's tags in force today (allergens, diets) |
| GET, PUT | `/catalog/preferences` | `Customer` role | The caller's allergen profile; the customer is always the caller |
| POST | `/catalog/preferences/check` | `Customer` role | The cart check: each line's listing and the options chosen on it against the caller's profile (only chosen options count); `private, no-store` |
| GET | `/catalog/listings/for-me`, `/catalog/listings/for-me/{id}` | `Customer` role | The same listings with each one's conflicts; `private, no-store`, never cached |

Errors are `{ code, message, errors? }`: `validation_failed` (422), `vendor_not_verified` (409), `not_found` (404).

## Behavior worth knowing

- A listing can become `Published` only while its vendor is `Verified`. Verification comes only from the `VendorVerified` / `VendorSuspended` events (applied in sequence order, duplicates ignored), never from a request. Today only the seed tool publishes them.
- Suspension hides a vendor's listings from public reads without rewriting them; `VendorVerified` restores them. A suspended vendor can still edit or unpublish, but cannot publish a draft.
- `ListingPublished` and `LowStockDetected` are stored in the listing document in the same write as the change, published inline, and re-sent by a relay if the publish failed; after repeated failures a listing's outbox is parked until an operator unparks it (register 30, 74). Nothing consumes them yet.
- The cache holds the published listings for 60 seconds. An edit, or a stock change that moves a listing between status words, invalidates the vendor's entries; a smaller quantity change shows in the cached copy only after the time is up. Personalized responses are never cached.
- "No conflicts" is an empty list, never "safe": the service reports what conflicts with the profile and does not certify anything.

## Run and test

```
dotnet test services/catalog-service/tests/CatalogService.Tests
ASPNETCORE_ENVIRONMENT=Development dotnet run --project services/catalog-service/src
```

Some tests skip without the Cosmos emulator (set `COSMOS_CONNECTION_STRING`); the service is hosted in-process by the rest. Configuration (`Events:Backend` is required; the data backend defaults to in-memory):

| Key | Values | Default |
|---|---|---|
| `Data:Backend` | `fake`, `cosmos` (needs `Cosmos:ConnectionString`, `Cosmos:Database`; local emulator also `Cosmos:GatewayMode`, `Cosmos:EnsureCreated`) | `fake` |
| `Events:Backend` | `inmemory`, `redis` (`Redis:ConnectionString`) | none: **required**, the service refuses to start without it (Development sets `redis`) |
| `Cache:Backend` | `local` (in-process), `redis` (`Cache:Redis:ConnectionString`, the cache Redis from the `with-redis` profile) | `local` |
| `ListingCache:TtlSeconds` | how long an entry lives; zero or less turns the cache off | 60 |
| `Auth:Authority`, `Auth:Audience` | OIDC issuer and audience | Development: `http://localhost:5100`, `bakery-marketplace` |

The `cosmos` and `redis` backends were run end to end against the local Cosmos emulator and Redis from `docker-compose.yml` (see `docs/operations/local-dev.md`); that needed the shared Cosmos SDK at 3.63.x. All backends are unverified against real Azure services.
