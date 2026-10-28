> **Outcome note (2026-10-28):** built on `feature/service-auth`. `POST /catalog/stock/reservations` reserves every line of an order in **one Cosmos transactional batch** (a decrement per limited-stock listing plus the order's reservation record, in the vendor's partition): all or nothing, idempotent by order id, duplicate lines for one listing summed, a rejection lists every problem line (`listing_not_found`, `not_available`, `exceeds_max_per_order`, `insufficient_stock` with the quantity available) and changes nothing. `DELETE /catalog/stock/reservations/{orderId}?vendorId=` returns only the stock that was actually taken, once, and only into a listing that is still limited-stock; a released reservation cannot be reserved again. Both need an app-only token with the `Stock.Reserve` role (`AUTH-006`); user tokens, tokens without the role and tokens that are not app-only are refused. `LowStockDetected` is published when a reservation pushes a listing into low.
>
> **Differences from the spec:** the release endpoint takes `vendorId` as a **query parameter**, because a reservation lives in the vendor's partition and an order id alone does not say which; an unknown reservation is a `404`. Several lines for one listing are summed by the catalog rather than rejected.
>
> **Needed shared-library work:** `IPartitionBatch` / `IBatchFactory` in `BakeryMarketplace.Data` (Cosmos transactional batch, and an in-memory equivalent that spans entity types), because the repository abstraction had no multi-item atomic write.
>
> **Verified (local):** 101 catalog tests (30 new); batch contract tests on the fake and on the **real Cosmos vNext emulator** (7/7, including 20 contending batches); and end to end on the real stack: a real client-credentials token from the mock issuer called the real catalog on Cosmos and Redis: reserve (3 lines, one made to order), idempotent repeat, atomic rejection (an unaffected line unchanged), max-per-order, release and repeat release restoring the stock once, 12 concurrent orders for the last 3 croissants (3 created, 9 rejected, sold out), anonymous 401, wrong client secret refused at the issuer, reservation records absent from public browse, no tokens in the log. Mutation checks: removing the stock check, the idempotency lookup, or the service-only policy are each caught. **Not done:** the ordering side that calls these endpoints (`ORD-001`), cleanup of orphaned reservations, a run on Azure, deployed-environment credentials (`AUTH-006` phase 2).

```
WI ID:               CAT-006
Title:                Stock reservation and release endpoints
Type:                 Service Implementation
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-ORDERING, EPIC-AUTH
Hat/Owner:            Engineering/Build
Status:               Built 2026-10-28 (see outcome note); the caller in `ORD-001` and deployed credentials remain
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
- `DELETE /catalog/stock/reservations/{orderId}?vendorId=` releases it (increments back, marks the record released); idempotent; releasing an unknown order is a `404`
- Only an authenticated service caller may use these endpoints (mechanism per open item 62); a user token is refused
- Tests: success, insufficient stock (nothing changes), repeated reserve, release, repeated release, concurrent reserves of the last unit (exactly one wins), made-to-order lines, wrong caller

**Dependencies**
- Blocked by: `CAT-005`, open item 62. Blocks: the limited-stock path of `ORD-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Auth changes need human approval before merge.
