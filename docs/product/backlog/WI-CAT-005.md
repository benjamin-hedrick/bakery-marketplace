> **Status:** Done · evidence: the Outcome note under this banner; `services/catalog-service`

> **Outcome note (2026-10-28):** built on `feature/service-auth` (the human lead asked to keep going on one branch). `Listing` has `availableQuantity` (absent = made to order), `maxPerOrder`, `lowStockThreshold` and an ETag. A `stock` block on create or edit sets all three; an edit with no `stock` block leaves stock alone, which keeps a counter safe from unrelated edits. `POST /catalog/listings/{id}/stock/adjust` applies a signed delta. Public reads show `stock.status` (`inStock`, `low`, `soldOut`) and `maxPerOrder`, never the count; the owner's write responses include the count and threshold. `LowStockDetected` is published when an item crosses into low or sold out, not while it stays there. The seed carries stock on its existing listings (sourdough 12 and max 4, croissant 4 = low, cookies 24 and max 6, muffin 0 = sold out, latte and lemon loaf made to order), so seed counts and totals are unchanged.
>
> **Needed a shared-library change:** the spec's "atomic against the listing's version" had nothing to build on, because `IRepository<T>` had no optimistic concurrency (open item 30). `IETagged` and `SaveIfUnchangedAsync` were added to `BakeryMarketplace.Data`; edits and adjustments save conditionally and re-read and retry on conflict.
>
> **Verified (local):** 71 catalog tests (36 new), Data contract tests on the fake; the same contract against the **real Cosmos vNext emulator** (7/7, including 25 concurrent read-modify-write loops); and the real catalog-service on Cosmos and Redis: 20 concurrent +1 adjustments gave exactly +20, 10 concurrent -1 on 3 units took 3 and refused 7, one `LowStockDetected` event, ownership 404/403/401. Mutation checks: removing the conditional save, ignoring the ETag, and exposing the count publicly are each caught. **Not done:** vendor read endpoints, GraphQL exposure of the status, Azure, the emulator contract tests in CI (they need `COSMOS_CONNECTION_STRING`). The default threshold of 5 is still a placeholder.

```
WI ID:               CAT-005
Title:                Listing stock fields and vendor stock controls
Type:                 Service Implementation
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-ORDERING
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

**Context / Why**
ADR-0017: the listing carries the stock. Vendors list items with a limited quantity or as made to order, and keep the quantity current.

**Inputs / References**
- *Decisions*: ADR-0017, ADR-0004 (partition by vendor), ADR-0006 (vendor ownership), first-slice contract D-1 (cents) and D-4 (anonymous reads)
- *Code*: `services/catalog-service` listing model, validator and update path (`CAT-001`)

**Out of scope**
- Reservation endpoints (`CAT-006`)
- Stock per day or window, availability windows, per-item pickup-window rules (open item 51)

**Requirements / Acceptance Criteria**
- `Listing` gains optional `availableQuantity` (absent = made to order), `maxPerOrder` and `lowStockThreshold`; validation rejects negatives and a `maxPerOrder` below 1
- Vendors can set the quantity through the existing listing update, and **increment or decrement it** with an atomic adjust (`POST /catalog/listings/{id}/stock/adjust` with a signed `delta`); both respect the listing's version and the vendor-ownership rule; a decrement below zero is refused with `409`
- Public reads return a stock status (`inStock`, `low`, `soldOut`; made-to-order is always `inStock`) and `maxPerOrder`, **not** the exact count; vendor reads can include the count
- `LowStockDetected` is published when an item crosses into low (and not repeatedly while it stays low)
- Seed data gains one limited-stock item and one made-to-order item; DTOs and the data model docs follow
- Tests: set, adjust up and down, below-zero refusal, concurrent adjusts, ownership, status mapping, event on crossing only

**Dependencies**
- Blocked by: `CAT-001` (done). Blocks: `CAT-006`, the limited-stock path of `ORD-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Open Points (working)**
- The default `lowStockThreshold` (5 is a placeholder)
