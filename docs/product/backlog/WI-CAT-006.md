```
WI ID:               CAT-006
Title:                Stock reservation and release endpoints
Type:                 Service Implementation
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-ORDERING, EPIC-AUTH
Hat/Owner:            Engineering/Build
Status:               Blocked on the service-to-service auth decision (open item 62); added 2026-10-28
Size:                 M
```

**Context / Why**
ADR-0017: `ordering-service` reserves stock when an order is placed and releases it on cancellation, through catalog, which owns the counter.

**Inputs / References**
- *Decisions*: ADR-0017, ADR-0008 (zero trust: catalog validates the caller itself), ADR-0003 (events)
- *Code*: `CAT-005` fields, `IRepository<T>` batch support (a Cosmos transactional batch within one partition)

**Out of scope**
- Calling these endpoints from ordering (`ORD-001`)
- The cleanup of reservations with no matching order (open item 62)

**Requirements / Acceptance Criteria**
- `POST /catalog/stock/reservations` with `{ orderId, vendorId, lines: [{ listingId, quantity }] }`: all lines of one vendor are applied in a single atomic batch (decrement each limited-stock listing, write a reservation record); made-to-order lines are accepted without change; the whole request fails with `409` and no change if any line lacks stock, is not Published, or exceeds `maxPerOrder`
- Idempotent by `orderId`: repeating a successful reservation returns the same result and changes nothing
- `DELETE /catalog/stock/reservations/{orderId}` releases it (increments back, marks the record released); idempotent; releasing an unknown order is a `404`
- Only an authenticated service caller may use these endpoints (mechanism per open item 62); a user token is refused
- Tests: success, insufficient stock (nothing changes), repeated reserve, release, repeated release, concurrent reserves of the last unit (exactly one wins), made-to-order lines, wrong caller

**Dependencies**
- Blocked by: `CAT-005`, open item 62. Blocks: the limited-stock path of `ORD-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Auth changes need human approval before merge.
