```
WI ID:               CAT-005
Title:                Listing stock fields and vendor stock controls
Type:                 Service Implementation
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-ORDERING
Hat/Owner:            Engineering/Build
Status:               Ready (added 2026-10-28)
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
