# catalog-service

Listings, customization/modifiers, allergy flags, search/discovery.

**Status: `WI-CAT-001` implemented** (listing CRUD, modifiers, allergen flags, vendor-verification publish gate). Search ranking, dietary-preference filtering, sponsored placement, preferences and the cache-aside read path (`CAT-003`) are not built. Findings and evidence: `docs/evidence/WI-CAT-001/findings.md`.

## Endpoints (first-slice contract §4; money is integer cents, USD)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/catalog/listings?limit=&after=` | anonymous | `Published` listings of currently `Verified` vendors, ordered by id; `{ items, nextCursor }` |
| GET | `/catalog/listings/{id}` | anonymous | 404 for drafts, unknown ids, and listings of vendors that are not verified |
| POST | `/catalog/listings` | `Vendor` role | Owner is the token `sub`; id, owner, `sponsored` and version are never client-settable |
| PUT | `/catalog/listings/{id}` | `Vendor` role + ownership | Replaces the mutable fields; another vendor's listing returns the same 404 as a missing one |

Errors are `{ code, message, errors? }`: `validation_failed` (422), `vendor_not_verified` (409), `not_found` (404).

## Behavior worth knowing

- A listing can become `Published` only while its vendor is `Verified`. Verification comes only from the `VendorVerified` / `VendorSuspended` events (applied in sequence order, duplicates ignored), never from a request.
- Suspension hides a vendor's listings from public reads without rewriting them; `VendorVerified` restores them. A suspended vendor can still edit or unpublish, but cannot publish a draft.
- `ListingPublished` is emitted on the Draft → Published transition. There is no outbox, so a failed publish is logged, not retried.

## Run and test

```
dotnet test services/catalog-service/tests/CatalogService.Tests
ASPNETCORE_ENVIRONMENT=Development dotnet run --project services/catalog-service/src
```

Configuration (`Events:Backend` is required; the data backend defaults to in-memory):

| Key | Values | Default |
|---|---|---|
| `Data:Backend` | `fake`, `cosmos` (needs `Cosmos:ConnectionString`, `Cosmos:Database`; local emulator also `Cosmos:GatewayMode`, `Cosmos:EnsureCreated`) | `fake` |
| `Events:Backend` | `inmemory`, `redis` (`Redis:ConnectionString`) | none: **required**, the service refuses to start without it (Development sets `redis`) |
| `Auth:Authority`, `Auth:Audience` | OIDC issuer and audience | Development: `http://localhost:5100`, `bakery-marketplace` (provisional until `WI-DEV-002` decides where the mock issuer runs) |

The `cosmos` and `redis` backends were run end to end against the local Cosmos emulator and Redis Streams from `docker-compose.yml` (2026-10-26; see `docs/operations/local-dev.md`). That needed the shared Cosmos SDK raised to 3.63.x. Both backends are unverified against real Azure services.
